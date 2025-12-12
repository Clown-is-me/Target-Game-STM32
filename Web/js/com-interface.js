class COMInterface {
    constructor(game, ui) {
        this.game = game;
        this.ui = ui;
        this.port = null;
        this.connected = false;
        this.reader = null;
        this.receiveBuffer = '';
        this.bufferTimeout = null;
        this.BUFFER_TIMEOUT_MS = 50;
        this.handleData = this.handleData.bind(this);

        this.handleLeftStep = this.handleLeftStep.bind(this);
        this.handleRightStep = this.handleRightStep.bind(this);

        this.handleMiddleClick1 = this.handleMiddleClick1.bind(this);
        //this.handleMiddleClick2 = this.handleMiddleClick2.bind(this);
        this.init();
    }

    init() {
        this.setupConnectButton();
        this.checkPermissions();
    }

    setupConnectButton() {
        const comConnectBtn = document.getElementById('com-connect-btn');
        if (comConnectBtn) {
            comConnectBtn.addEventListener('click', async () => {
                if (!this.connected) {
                    await this.connectWithRetry();
                } else {
                    await this.disconnect();
                }
            });
        }
    }

    async checkPermissions() {
        if (!('serial' in navigator)) {
            console.warn('Web Serial API не поддерживается');
            return;
        }
        try {
            const ports = await navigator.serial.getPorts();
            console.log('Найденные порты:', ports.length);
        } catch (error) {
            console.log('Нет сохраненных разрешений:', error);
        }
    }

    async connectWithRetry() {
        try {
            this.game.logMessage('Выберите COM-порт в появившемся окне...');
            const port = await this.requestPortWithTimeout(10000);
            if (!port) throw new Error('Порт не выбран (таймаут или отмена)');
            await this.connectToPort(port);
        } catch (error) {
            console.error('Ошибка подключения:', error);
            let errorMessage = error.message;
            if (error.name === 'NotFoundError') {
                errorMessage = 'Порт не выбран. Повторите подключение.';
            } else if (error.name === 'SecurityError') {
                errorMessage = 'Ошибка безопасности. Убедитесь, что сайт HTTPS и имеет разрешение.';
            }
            this.game.logMessage(`Ошибка: ${errorMessage}`);
            if (this.ui.showNotification) this.ui.showNotification(errorMessage, 'error');
        }
    }

    requestPortWithTimeout(timeout) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => reject(new Error('Таймаут выбора порта')), timeout);
            navigator.serial.requestPort()
                .then(port => {
                    clearTimeout(timeoutId);
                    resolve(port);
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    reject(err);
                });
        });
    }

    async connectToPort(port) {
        try {
            await port.open({ baudRate: 115200 });
            this.port = port;
            this.connected = true;
            this.updateUIStatus(true);
            this.game.logMessage('COM-порт подключён');
            this.startReading();
        } catch (error) {
            console.error('Ошибка открытия порта:', error);
            throw error;
        }
    }

    async startReading() {
        if (!this.port?.readable) return;
        try {
            this.reader = this.port.readable.getReader();
            while (this.connected) {
                const { value, done } = await this.reader.read();
                if (done) break;
                if (value) {
                    const text = new TextDecoder().decode(value);
                    this.processIncomingData(text);
                }
            }
        } catch (error) {
            console.error('Ошибка чтения:', error);
            if (this.connected) {
                await this.safeDisconnect();
                this.game.logMessage('COM-соединение разорвано: ' + error.message);
            }
        } finally {
            await this.releaseReader();
        }
    }

    async releaseReader() {
        if (this.reader) {
            try {
                await this.reader.cancel();
                this.reader.releaseLock();
                this.reader = null;
            } catch (e) {
                console.error('Ошибка освобождения ридера:', e);
            }
        }
    }

    processIncomingData(text) {
        this.receiveBuffer += text;
        if (this.bufferTimeout) clearTimeout(this.bufferTimeout);
        this.bufferTimeout = setTimeout(() => this.processBuffer(), this.BUFFER_TIMEOUT_MS);
    }

    processBuffer() {
        if (!this.receiveBuffer) return;
        const lines = this.receiveBuffer.split('\r\n');
        this.receiveBuffer = lines.pop() || '';
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed) {
                this.game.logMessage(`COM: ${trimmed}`);
                this.handleData(trimmed);
            }
        });
    }

    handleData(data) {
        if (data.startsWith('TIME:')) {
            const seconds = parseInt(data.substring(5));
            if (!isNaN(seconds) && this.game) {
                this.game.updateTimeFromCom(seconds);
            }
        }
        else if (data.startsWith('SHIP:')) {
            const parts = data.substring(5).split(',');
            const type = parseInt(parts[0]);
            const x = parseInt(parts[1]);
            const y = parts[2] ? parseInt(parts[2]) : null;
            if (!isNaN(type) && !isNaN(x) && this.game) {
                this.game.addShipFromCom(type, x, y);
            }
        }
        else if (data.startsWith('RESULT:')) {
            const payload = data.substring(7);
            if (payload.startsWith('HIT:')) {
                const parts = payload.substring(4).split(',');
                const points = parseInt(parts[0]);
                const x = parseInt(parts[1]);
                const y = parseInt(parts[2]);
                if (!isNaN(points) && !isNaN(x) && !isNaN(y)) {
                    this.game.handleComHit(points, x, y);
                }
            } else if (payload.startsWith('MISS,')) { // Обратите внимание на запятую
                const parts = payload.substring(5).split(',');
                const x = parseInt(parts[0]);
                const y = parseInt(parts[1]);
                if (!isNaN(x) && !isNaN(y)) {
                    this.game.handleComMiss(x, y);
                }
            }
        }
        else if (data.startsWith('CROSSHAIR:')) {
            const parts = data.substring(10).split(',');
            const x = parseInt(parts[0]);
            if (!isNaN(x)) {
                this.game.comCrosshairX = x; // ← сохраняем!
            }
        }
        else if (data === 'STARTED_STORM') {
            this.game?.startStorm();
        }
        else if (data === 'ENDED_STORM') {
            this.game?.endStorm();
        }
        else if (data.startsWith('STORM:') && !data.includes('STARTED') && !data.includes('ENDED')) {
            const payload = data.substring(6);
            const [xStr, yStr] = payload.split(',');
            const x = parseInt(xStr, 10);
            const y = parseInt(yStr, 10);
            if (!isNaN(x) && !isNaN(y)) {
                this.game?.setStormOffset(x, y);
            }
        }
        else if (data.startsWith('STORM_AMP_UPDATED:')) {
            const [xStr, yStr] = data.substring(19).split(',');
            const x = parseInt(xStr);
            const y = parseInt(yStr);
            if (!isNaN(x) && !isNaN(y)) {
                this.game.stormAmplitudeX = x;
                this.game.stormAmplitudeY = y;
                document.getElementById('storm-amplitude').textContent = x;
            }
        }
        // Старые команды — для совместимости (можно удалить позже)
        else if (data === 'CROSSHAIR_STEP_LEFT') this.handleLeftStep();
        else if (data === 'CROSSHAIR_STEP_RIGHT') this.handleRightStep();
        else if (data.startsWith('MIDDLE_CLICK:')) {
            const parts = data.substring(13).split(',');
            const x_from_com = parseInt(parts[0]);
            const y_from_com = parseInt(parts[1]);
            
            if (!isNaN(x_from_com) && !isNaN(y_from_com)) {
                this.game.comCrosshairX = x_from_com;
                this.game.comCrosshairY = y_from_com;
                
                if (!this.game.crosshairLocked) {
                    this.handleMiddleClick1();
                } else {
                    if (this.game.gameActive && !this.game.gamePaused) {
                        this.game.fire(); 
                    }
                }
            }
        }
    }

    handleLeftStep() {
        if (this.ui.controlMode === 'com' && this.game.gameActive && !this.game.gamePaused && !this.game.crosshairLocked) {
            this.game.stepCrosshair(-1);
            this.game.logMessage('COM: Шаг влево');
        }
    }

    handleRightStep() {
        if (this.ui.controlMode === 'com' && this.game.gameActive && !this.game.gamePaused && !this.game.crosshairLocked) {
            this.game.stepCrosshair(1);
            this.game.logMessage('COM: Шаг вправо');
        }
    }

    handleMiddleClick1() {
        if (this.ui.controlMode !== 'com') return;
        if (!this.game.gameActive || this.game.gamePaused) return;
        //if (this.game.crosshairLocked) return; // уже зафиксирован — не реагируем

        this.game.lockCrosshair();
        this.game.logMessage('COM: Прицел зафиксирован (вертикальное движение)');
    }

    // handleMiddleClick2() {
    //     if (this.ui.controlMode !== 'com') return;
    //     if (!this.game.gameActive || this.game.gamePaused) return;
    //     if (!this.game.crosshairLocked) return;

    //     // Берём X и Y от STM32 (точные значения)
    //     const logicalX = this.game.comCrosshairX;
    //     const logicalY = this.game.comCrosshairY; // ← ИСПОЛЬЗУЕМ Y ОТ ПЛАТЫ!

    //     if (logicalX === null || logicalY === null) {
    //         console.warn('Нет данных о координатах от STM32!');
    //         return;
    //     }

    //     // Отправляем на STM32
    //     this.sendCommand(`SHOT:${logicalX},${logicalY}`);
    //     this.game.logMessage(`→ Отправлен выстрел: SHOT:${logicalX},${logicalY}`);
    // }

    handleStatus(statusData) {
        console.log('Статус с устройства:', statusData);
    }

    updateUIStatus(connected) {
        const btn = document.getElementById('com-connect-btn');
        if (btn) {
            btn.classList.toggle('connected', connected);
            btn.innerHTML = connected
                ? '<i class="fas fa-plug"></i><span>Отключить COM</span>'
                : '<i class="fas fa-plug"></i><span>Подключить COM</span>';
        }
    }

    async safeDisconnect() {
        this.connected = false;
        if (this.bufferTimeout) clearTimeout(this.bufferTimeout);
        this.receiveBuffer = '';
        await this.releaseReader();
        if (this.port) {
            await this.port.close();
            this.port = null;
        }
        this.updateUIStatus(false);
    }

    async disconnect() {
        await this.safeDisconnect();
        this.game.logMessage('COM-порт отключён');
    }

    //НОВЫЙ МЕТОД: отправка команд на STM32
    async sendCommand(command) {
        if (!this.connected || !this.port?.writable) {
            console.warn('Невозможно отправить команду: COM не подключён');
            return false;
        }
        try {
            const writer = this.port.writable.getWriter();
            const encoder = new TextEncoder();
            const message = `CMD:${command}\r\n`;
            await writer.write(encoder.encode(message));
            writer.releaseLock();
            this.game.logMessage(`→ Отправлено на COM: ${message.trim()}`);
            return true;
        } catch (error) {
            console.error('Ошибка отправки команды:', error);
            this.game.logMessage(`Ошибка отправки: ${error.message}`);
            return false;
        }
    }
}