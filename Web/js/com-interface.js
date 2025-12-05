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
        this.handleLeftPress = this.handleLeftPress.bind(this);
        this.handleLeftRelease = this.handleLeftRelease.bind(this);
        this.handleRightPress = this.handleRightPress.bind(this);
        this.handleRightRelease = this.handleRightRelease.bind(this);
        this.handleMiddleClick1 = this.handleMiddleClick1.bind(this);
        this.handleMiddleClick2 = this.handleMiddleClick2.bind(this);
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
        if (data === 'LEFT_PRESS') this.handleLeftPress();
        else if (data === 'LEFT_RELEASE') this.handleLeftRelease();
        else if (data === 'RIGHT_PRESS') this.handleRightPress();
        else if (data === 'RIGHT_RELEASE') this.handleRightRelease();
        else if (data === 'MIDDLE_CLICK_1') this.handleMiddleClick1();
        else if (data === 'MIDDLE_CLICK_2') this.handleMiddleClick2();
        else if (data.startsWith('STATUS:')) this.handleStatus(data);
        // Другие команды игнорируются
    }

    handleLeftPress() {
        if (this.ui.controlMode === 'com' && this.game.gameActive && !this.game.gamePaused && !this.game.crosshairLocked) {
            this.game.moveLeft = true;
            this.game.moveRight = false;
            this.game.logMessage('COM: Движение влево');
        }
    }

    handleLeftRelease() {
        if (this.ui.controlMode === 'com') this.game.moveLeft = false;
    }

    handleRightPress() {
        if (this.ui.controlMode === 'com' && this.game.gameActive && !this.game.gamePaused && !this.game.crosshairLocked) {
            this.game.moveRight = true;
            this.game.moveLeft = false;
            this.game.logMessage('COM: Движение вправо');
        }
    }

    handleRightRelease() {
        if (this.ui.controlMode === 'com') this.game.moveRight = false;
    }

    handleMiddleClick1() {
        if (this.ui.controlMode === 'com' && this.game.gameActive && !this.game.gamePaused && !this.game.crosshairLocked) {
            this.game.lockCrosshair();
            this.game.logMessage('COM: Прицел зафиксирован');
        }
    }

    handleMiddleClick2() {
        if (this.ui.controlMode === 'com' && this.game.gameActive && !this.game.gamePaused && this.game.crosshairLocked) {
            this.game.fire();
            this.game.logMessage('COM: Выстрел произведён');
        }
    }

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

    // 🔹 НОВЫЙ МЕТОД: отправка команд на STM32
    async sendCommand(command) {
        if (!this.connected || !this.port?.writable) {
            console.warn('Невозможно отправить команду: COM не подключен');
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