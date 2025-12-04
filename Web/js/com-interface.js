class COMInterface {
    constructor(game, ui) {
        this.game = game;
        this.ui = ui;
        this.port = null;
        this.connected = false;
        this.reader = null;
        this.receiveBuffer = '';
        this.bufferTimeout = null;
        this.BUFFER_TIMEOUT_MS = 50; // 50 мс для сбора полного сообщения
        
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
    
    // Проверяем разрешения
    async checkPermissions() {
        if (!('serial' in navigator)) {
            console.warn('Web Serial API не поддерживается');
            return;
        }
        
        try {
            // Пытаемся получить доступ к уже разрешенным портам
            const ports = await navigator.serial.getPorts();
            console.log('Найденные порты:', ports.length);
            
            if (ports.length > 0) {
                console.log('Есть сохраненные порты, можно подключаться');
            }
        } catch (error) {
            console.log('Нет сохраненных разрешений:', error);
        }
    }
    
    async connectWithRetry() {
        try {
            // Показываем пользователю сообщение
            if (this.game && this.game.logMessage) {
                this.game.logMessage('Выберите COM-порт в появившемся окне...');
            }
            
            // Запрашиваем порт с обработкой отмены
            const port = await this.requestPortWithTimeout(10000); // 10 секунд таймаут
            
            if (!port) {
                throw new Error('Порт не выбран (таймаут или отмена)');
            }
            
            await this.connectToPort(port);
            
        } catch (error) {
            console.error('Ошибка подключения:', error);
            
            let errorMessage = error.message;
            if (error.name === 'NotFoundError') {
                errorMessage = 'Порт не выбран. Нажмите "Подключить COM" еще раз и выберите порт';
            } else if (error.name === 'SecurityError') {
                errorMessage = 'Ошибка безопасности. Убедитесь, что сайт имеет доступ к COM-портам';
            }
            
            // Показываем пользователю
            if (this.game && this.game.logMessage) {
                this.game.logMessage(`Ошибка: ${errorMessage}`);
            }
            
            if (this.ui && this.ui.showNotification) {
                this.ui.showNotification(errorMessage, 'error');
            }
        }
    }
    
    // Функция с таймаутом для выбора порта
    requestPortWithTimeout(timeout) {
        return new Promise((resolve, reject) => {
            let timeoutId = null;
            
            // Основной запрос порта
            const portPromise = navigator.serial.requestPort();
            
            // Таймаут
            timeoutId = setTimeout(() => {
                reject(new Error('Таймаут выбора порта'));
            }, timeout);
            
            // Обрабатываем результат
            portPromise
                .then(port => {
                    clearTimeout(timeoutId);
                    resolve(port);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }
    
    async connectToPort(port) {
        try {
            console.log('Открываем порт:', port);
            
            // Открываем порт с настройками по умолчанию
            await port.open({
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                bufferSize: 255,
                flowControl: 'none'
            });
            
            this.port = port;
            this.connected = true;
            
            console.log('Порт успешно открыт');
            
            // Обновляем UI
            this.updateUIStatus(true);
            
            // Логируем
            if (this.game && this.game.logMessage) {
                this.game.logMessage('COM-порт подключен');
                this.game.logMessage('Нажимайте кнопки на плате...');
            }
            
            // Начинаем чтение данных
            this.startReading();
            
            return true;
            
        } catch (error) {
            console.error('Ошибка открытия порта:', error);
            throw error;
        }
    }
    
    async startReading() {
        if (!this.port || !this.port.readable) {
            console.error('Порт не готов для чтения');
            return;
        }
        
        try {
            this.reader = this.port.readable.getReader();
            console.log('Начинаем чтение данных...');
            
            while (this.connected) {
                try {
                    const { value, done } = await this.reader.read();
                    
                    if (done) {
                        console.log('Поток чтения завершен');
                        break;
                    }
                    
                    if (value) {
                        const text = new TextDecoder().decode(value);
                        this.processIncomingData(text);
                    }
                } catch (readError) {
                    if (this.connected) {
                        console.error('Ошибка чтения данных:', readError);
                        break;
                    }
                }
            }
            
        } catch (error) {
            console.error('Ошибка при запуске чтения:', error);
            
            // При ошибке чтения отключаемся
            if (this.connected) {
                await this.safeDisconnect();
                
                if (this.game && this.game.logMessage) {
                    this.game.logMessage('COM-соединение разорвано: ' + error.message);
                }
            }
            
        } finally {
            // Освобождаем ридер, если он еще не освобожден
            await this.releaseReader();
        }
    }

    // Освобождаем ридер
    async releaseReader() {
        if (this.reader) {
            try {
                // Отменяем чтение перед освобождением
                await this.reader.cancel();
                this.reader.releaseLock();
                this.reader = null;
            } catch (error) {
                console.error('Ошибка при освобождении ридера:', error);
            }
        }
    }
    
    // Обработка входящих данных с буферизацией
    processIncomingData(text) {
        // Добавляем данные в буфер
        this.receiveBuffer += text;
        
        // Сбрасываем таймер
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }
        
        // Устанавливаем таймер для обработки буфера
        this.bufferTimeout = setTimeout(() => {
            this.processBuffer();
        }, this.BUFFER_TIMEOUT_MS);
    }
    
    // Обработка буферизированных данных
    processBuffer() {
        if (!this.receiveBuffer) return;
        
        // Разделяем по переводам строк
        const lines = this.receiveBuffer.split('\r\n');
        
        // Последняя часть может быть неполной, оставляем ее в буфере
        this.receiveBuffer = lines.pop() || '';
        
        // Обрабатываем полные строки
        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                console.log('COM данные:', trimmedLine);
                
                // Логируем в игре
                if (this.game && this.game.logMessage) {
                    this.game.logMessage(`COM: ${trimmedLine}`);
                }
                
                // Обрабатываем команды
                this.handleData(trimmedLine);
            }
        });
    }
    
    handleData(data) {
        console.log('Обработка команды:', data);
        
        // Обработка команд от устройства
        if (data === 'LEFT_PRESS') {
            this.handleLeftPress();
        } else if (data === 'LEFT_RELEASE') {
            this.handleLeftRelease();
        } else if (data === 'RIGHT_PRESS') {
            this.handleRightPress();
        } else if (data === 'RIGHT_RELEASE') {
            this.handleRightRelease();
        } else if (data === 'MIDDLE_CLICK_1') {
            this.handleMiddleClick1();
        } else if (data === 'MIDDLE_CLICK_2') {
            this.handleMiddleClick2();
        } else if (data.startsWith('STATUS:')) {
            this.handleStatus(data);
        } else {
            console.log('Неизвестная команда:', data);
        }
    }
    
    handleLeftPress() {
        console.log('COM: Левая кнопка нажата');
        if (this.ui.controlMode === 'com' && this.game.gameActive && !this.game.gamePaused) {
            if (!this.game.crosshairLocked) {
                this.game.moveLeft = true;
                this.game.moveRight = false;
                this.game.logMessage('COM: Движение влево');
            }
        }
    }
    
    handleLeftRelease() {
        console.log('COM: Левая кнопка отпущена');
        if (this.ui.controlMode === 'com') {
            this.game.moveLeft = false;
        }
    }
    
    handleRightPress() {
        console.log('COM: Правая кнопка нажата');
        if (this.ui.controlMode === 'com' && this.game.gameActive && !this.game.gamePaused) {
            if (!this.game.crosshairLocked) {
                this.game.moveRight = true;
                this.game.moveLeft = false;
                this.game.logMessage('COM: Движение вправо');
            }
        }
    }
    
    handleRightRelease() {
        console.log('COM: Правая кнопка отпущена');
        if (this.ui.controlMode === 'com') {
            this.game.moveRight = false;
        }
    }
    
    handleMiddleClick1() {
        console.log('COM: Средняя кнопка - клик 1 (фиксация)');
        if (this.ui.controlMode === 'com' && this.game.gameActive && !this.game.gamePaused) {
            if (!this.game.crosshairLocked) {
                this.game.lockCrosshair();
                this.game.logMessage('COM: Прицел зафиксирован');
            }
        }
    }
    
    handleMiddleClick2() {
        console.log('COM: Средняя кнопка - клик 2 (выстрел)');
        if (this.ui.controlMode === 'com' && this.game.gameActive && !this.game.gamePaused) {
            if (this.game.crosshairLocked) {
                this.game.fire();
                this.game.logMessage('COM: Выстрел произведен');
            }
        }
    }
    
    handleStatus(statusData) {
        // Обработка статусных сообщений
        console.log('Статус устройства:', statusData);
    }
    
    updateUIStatus(connected) {
        const comConnectBtn = document.getElementById('com-connect-btn');
        const comModeBtn = document.getElementById('com-mode');
        
        if (comConnectBtn) {
            if (connected) {
                comConnectBtn.classList.add('connected');
                comConnectBtn.innerHTML = '<i class="fas fa-plug"></i><span>Отключить COM</span>';
            } else {
                comConnectBtn.classList.remove('connected');
                comConnectBtn.innerHTML = '<i class="fas fa-plug"></i><span>Подключить COM</span>';
            }
        }
    }
    
    async safeDisconnect() {
        try {
            this.connected = false;
            
            // Сбрасываем буфер таймаут
            if (this.bufferTimeout) {
                clearTimeout(this.bufferTimeout);
                this.bufferTimeout = null;
            }
            
            // Сбрасываем буфер данных
            this.receiveBuffer = '';
            
            // Освобождаем ридер
            await this.releaseReader();
            
            // Закрываем порт
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            this.updateUIStatus(false);
            console.log('Безопасное отключение завершено');
            
        } catch (error) {
            console.error('Ошибка безопасного отключения:', error);
        }
    }
    
    async disconnect() {
        try {
            console.log('Начинаем отключение COM порта...');
            this.connected = false;
            
            // Вызываем безопасное отключение
            await this.safeDisconnect();
            
            console.log('COM отключен');
            
            if (this.game && this.game.logMessage) {
                this.game.logMessage('COM-порт отключен');
            }
            
        } catch (error) {
            console.error('Ошибка отключения:', error);
            
            if (this.game && this.game.logMessage) {
                this.game.logMessage('Ошибка отключения COM: ' + error.message);
            }
        }
    }
    
    // Метод для отправки данных на устройство (если нужно)
    async sendData(data) {
        if (!this.connected || !this.port || !this.port.writable) {
            console.error('Порт не готов для записи');
            return false;
        }
        
        try {
            const writer = this.port.writable.getWriter();
            const encoder = new TextEncoder();
            const encodedData = encoder.encode(data + '\r\n');
            
            await writer.write(encodedData);
            writer.releaseLock();
            
            console.log('Данные отправлены:', data);
            return true;
            
        } catch (error) {
            console.error('Ошибка отправки данных:', error);
            return false;
        }
    }
}