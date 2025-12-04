// Класс для работы с COM-устройством (STM32)
class COMInterface {
    constructor(game, ui) {
        this.game = game;
        this.ui = ui;
        this.connected = false;
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.inputBuffer = '';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 2000;
        
        // Элементы UI
        this.comStatus = document.getElementById('com-status');
        this.comModeBtn = document.getElementById('com-mode');
        
        this.init();
    }
    
    async init() {
        // Проверяем доступность Web Serial API
        if (!('serial' in navigator)) {
            this.showComNotSupported();
            return;
        }
        
        // Пытаемся автоматически подключиться к последнему устройству
        const savedPort = localStorage.getItem('last-com-port');
        if (savedPort) {
            try {
                await this.connectToSavedPort(savedPort);
            } catch (error) {
                console.log('Не удалось подключиться к сохраненному порту:', error);
            }
        }
        
        // Слушаем события подключения/отключения
        navigator.serial.addEventListener('connect', () => {
            console.log('COM-устройство подключено');
            this.tryAutoConnect();
        });
        
        navigator.serial.addEventListener('disconnect', () => {
            console.log('COM-устройство отключено');
            this.handleDisconnect();
        });
    }
    
    async connectToSavedPort(savedPortInfo) {
        // В Web Serial API нет сохранения портов между сессиями
        // Поэтому просто пытаемся подключиться к любому доступному порту
        return this.connect();
    }
    
    async connect() {
        try {
            // Запрашиваем порт у пользователя
            this.port = await navigator.serial.requestPort({
                filters: [
                    { usbVendorId: 0x0483 }, // STMicroelectronics
                    { usbVendorId: 0x2341 }, // Arduino
                    { usbVendorId: 0x2E8A }  // Raspberry Pi
                ]
            });
            
            // Открываем порт
            await this.port.open({ baudRate: 115200 });
            
            console.log('COM-порт открыт:', this.port.getInfo());
            
            // Настраиваем поток чтения
            const textDecoder = new TextDecoderStream();
            const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
            this.reader = textDecoder.readable.getReader();
            
            // Настраиваем поток записи
            const textEncoder = new TextEncoderStream();
            const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
            this.writer = textEncoder.writable.getWriter();
            
            // Обновляем статус
            this.connected = true;
            this.reconnectAttempts = 0;
            this.updateUI();
            
            // Сохраняем информацию о порте
            const portInfo = this.port.getInfo();
            localStorage.setItem('last-com-port', JSON.stringify(portInfo));
            
            // Запускаем чтение данных
            this.startReading();
            
            // Отправляем приветственное сообщение
            await this.sendCommand('HELLO');
            
            // Запрашиваем текущее состояние игры
            await this.sendCommand('STATUS');
            
            this.game.logMessage('COM-устройство подключено');
            
        } catch (error) {
            console.error('Ошибка подключения к COM-порту:', error);
            this.handleConnectionError(error);
        }
    }
    
    async disconnect() {
        try {
            // Закрываем потоки
            if (this.reader) {
                await this.reader.cancel();
                this.reader = null;
            }
            
            if (this.writer) {
                await this.writer.close();
                this.writer = null;
            }
            
            // Закрываем порт
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            // Обновляем статус
            this.connected = false;
            this.updateUI();
            
            // Если был активен COM-режим, переключаемся на клавиатуру
            if (this.comModeBtn.classList.contains('active')) {
                this.ui.setControlMode('keyboard');
            }
            
            this.game.logMessage('COM-устройство отключено');
            
        } catch (error) {
            console.error('Ошибка отключения:', error);
        }
    }
    
    async startReading() {
        try {
            while (this.connected && this.reader) {
                const { value, done } = await this.reader.read();
                
                if (done) {
                    console.log('Чтение завершено');
                    this.reader.releaseLock();
                    break;
                }
                
                if (value) {
                    this.processData(value);
                }
            }
        } catch (error) {
            console.error('Ошибка чтения из COM-порта:', error);
            if (this.connected) {
                this.handleDisconnect();
            }
        }
    }
    
    processData(data) {
        this.inputBuffer += data;
        
        // Разделяем на строки
        const lines = this.inputBuffer.split('\n');
        
        // Оставляем незавершенную строку в буфере
        this.inputBuffer = lines.pop() || '';
        
        // Обрабатываем каждую строку
        lines.forEach(line => {
            line = line.trim();
            if (line) {
                this.parseMessage(line);
            }
        });
    }
    
    parseMessage(message) {
        console.log('COM -> WEB:', message);
        
        // Обрабатываем разные типы сообщений
        const parts = message.split(':');
        const command = parts[0];
        
        switch (command) {
            case 'GAME':
                this.handleGameState(parts.slice(1));
                break;
                
            case 'CROSSHAIR':
                this.handleCrosshairPosition(parts.slice(1));
                break;
                
            case 'SHIP':
                this.handleShipSpawn(parts.slice(1));
                break;
                
            case 'HIT':
                this.handleHitEvent(parts.slice(1));
                break;
                
            case 'MISS':
                this.handleMissEvent();
                break;
                
            case 'LOG':
                this.handleLogMessage(parts.slice(1).join(':'));
                break;
                
            case 'GAME_EVENT':
                this.handleGameEvent(parts.slice(1));
                break;
                
            case 'ERROR':
                this.handleErrorMessage(parts.slice(1).join(':'));
                break;
                
            default:
                // Если сообщение не распознано, логируем его
                this.game.logMessage(`COM: ${message}`);
                break;
        }
    }
    
    handleGameState(parts) {
        if (parts.length >= 5) {
            const score = parseInt(parts[0]) || 0;
            const hits = parseInt(parts[1]) || 0;
            const shots = parseInt(parts[2]) || 0;
            const accuracy = parseInt(parts[3]) || 0;
            const time = parseInt(parts[4]) || 0;
            
            // Обновляем состояние игры только если COM-режим активен
            if (this.comModeBtn.classList.contains('active')) {
                this.game.score = score;
                this.game.hits = hits;
                this.game.shots = shots;
                this.game.timeLeft = time;
                
                // Обновляем UI
                this.game.updateUI();
                
                // Обновляем таймер если нужно
                if (time !== this.game.gameTime - this.game.timeLeft) {
                    this.game.timeLeft = time;
                }
            }
        }
    }
    
    handleCrosshairPosition(parts) {
        if (parts.length >= 3 && this.comModeBtn.classList.contains('active')) {
            const x = parseInt(parts[0]) || 50;
            const y = parseInt(parts[1]) || 50;
            const locked = parseInt(parts[2]) || 0;
            
            // Преобразуем проценты в пиксели
            const pixelX = (x / 100) * this.game.fieldWidth;
            const pixelY = (y / 100) * this.game.fieldHeight;
            
            // Обновляем позицию прицела
            this.game.crosshair.style.left = `${pixelX}px`;
            this.game.crosshair.style.top = `${pixelY}px`;
            
            // Обновляем состояние фиксации
            this.game.crosshairLocked = locked === 1;
            
            if (this.game.crosshairLocked && !this.game.crosshairMoveTimer) {
                this.game.startCrosshairAutoMove();
            } else if (!this.game.crosshairLocked && this.game.crosshairMoveTimer) {
                this.game.stopCrosshairAutoMove();
            }
            
            this.game.updateCrosshairState();
        }
    }
    
    handleShipSpawn(parts) {
        if (parts.length >= 3 && this.comModeBtn.classList.contains('active')) {
            const typeChar = parts[0] || 'S';
            const x = parseInt(parts[1]) || 50;
            const y = parseInt(parts[2]) || 50;
            
            // Определяем тип корабля
            let shipType;
            let points;
            
            if (typeChar === 'S') {
                shipType = 'small';
                points = 10;
            } else if (typeChar === 'M') {
                shipType = 'medium';
                points = 20;
            } else {
                shipType = 'large';
                points = 30;
            }
            
            // Создаем корабль
            this.createComShip(shipType, points, x, y);
        }
    }
    
    createComShip(type, points, xPercent, yPercent) {
        const ship = document.createElement('div');
        ship.className = `ship ${type} appearing`;
        ship.dataset.points = points;
        
        // Преобразуем проценты в пиксели
        const pixelX = (xPercent / 100) * this.game.fieldWidth;
        const pixelY = (yPercent / 100) * this.game.fieldHeight;
        
        ship.style.left = `${pixelX}px`;
        ship.style.top = `${pixelY}px`;
        
        // Добавляем корабль на поле
        this.game.gameField.appendChild(ship);
        this.game.ships.push({
            element: ship,
            points: points,
            x: pixelX,
            y: pixelY
        });
        
        // Убираем класс анимации
        setTimeout(() => {
            ship.classList.remove('appearing');
        }, 500);
        
        this.game.logMessage(`COM: Появился корабль (${type})`);
    }
    
    handleHitEvent(parts) {
        if (parts.length >= 2 && this.comModeBtn.classList.contains('active')) {
            const typeChar = parts[0] || 'S';
            const points = parseInt(parts[1]) || 10;
            
            let shipType;
            switch(typeChar) {
                case 'S': shipType = 'Шхуна'; break;
                case 'M': shipType = 'Бриг'; break;
                case 'L': shipType = 'Фрегат'; break;
                default: shipType = 'судно';
            }
            
            this.game.logMessage(`COM: Попадание в ${shipType}! +${points} очков`);
        }
    }
    
    handleMissEvent() {
        if (this.comModeBtn.classList.contains('active')) {
            this.game.logMessage('COM: Промах!');
        }
    }
    
    handleLogMessage(message) {
        this.game.logMessage(`COM: ${message}`);
    }
    
    handleGameEvent(parts) {
        if (parts.length >= 2) {
            const event = parts[0];
            const data = parts[1];
            
            switch(event) {
                case 'GAME_START':
                    this.game.logMessage('COM: Игра началась');
                    break;
                case 'GAME_END':
                    this.game.logMessage(`COM: Игра завершена. Счет: ${data}`);
                    break;
                case 'CROSSHAIR_LOCK':
                    this.game.logMessage('COM: Прицел зафиксирован');
                    break;
                case 'FIRE':
                    this.game.logMessage('COM: Произведен выстрел');
                    break;
                case 'HIT':
                    this.game.logMessage(`COM: Попадание! +${data} очков`);
                    break;
                case 'MISS':
                    this.game.logMessage('COM: Промах');
                    break;
            }
        }
    }
    
    handleErrorMessage(message) {
        console.error('COM Ошибка:', message);
        this.game.logMessage(`COM ОШИБКА: ${message}`);
    }
    
    async sendCommand(command) {
        if (!this.connected || !this.writer) {
            console.warn('Не могу отправить команду: COM не подключен');
            return false;
        }
        
        try {
            await this.writer.write(command + '\r\n');
            console.log('WEB -> COM:', command);
            return true;
        } catch (error) {
            console.error('Ошибка отправки команды:', error);
            this.handleDisconnect();
            return false;
        }
    }
    
    async sendGameControl(command) {
        // Отправляем команды управления игрой
        switch(command) {
            case 'START':
                return await this.sendCommand('S');
            case 'RESET':
                return await this.sendCommand('R');
            case 'PAUSE':
                return await this.sendCommand('P');
            default:
                console.warn('Неизвестная команда:', command);
                return false;
        }
    }
    
    updateUI() {
        if (this.connected) {
            const portInfo = this.port ? this.port.getInfo() : {};
            const vendorId = portInfo.usbVendorId ? `0x${portInfo.usbVendorId.toString(16)}` : 'Неизвестно';
            const productId = portInfo.usbProductId ? `0x${portInfo.usbProductId.toString(16)}` : 'Неизвестно';
            
            this.comStatus.innerHTML = `
                <i class="fas fa-check-circle"></i> 
                COM-устройство подключено<br>
                <small>Vendor: ${vendorId}, Product: ${productId}</small>
            `;
            this.comStatus.style.background = 'rgba(40, 167, 69, 0.2)';
            this.comStatus.style.borderColor = 'rgba(40, 167, 69, 0.3)';
            this.comStatus.style.color = '#28a745';
            
            this.comModeBtn.classList.remove('disabled');
            this.comModeBtn.disabled = false;
            
        } else {
            this.comStatus.innerHTML = `
                <i class="fas fa-times-circle"></i> 
                COM-устройство не подключено
                <button id="connect-com-btn" class="connect-btn">
                    <i class="fas fa-plug"></i> Подключить
                </button>
            `;
            this.comStatus.style.background = 'rgba(220, 53, 69, 0.2)';
            this.comStatus.style.borderColor = 'rgba(220, 53, 69, 0.3)';
            this.comStatus.style.color = '#dc3545';
            
            this.comModeBtn.classList.add('disabled');
            this.comModeBtn.disabled = true;
            
            // Добавляем обработчик кнопки подключения
            setTimeout(() => {
                const connectBtn = document.getElementById('connect-com-btn');
                if (connectBtn) {
                    connectBtn.addEventListener('click', () => this.connect());
                }
            }, 100);
        }
    }
    
    handleDisconnect() {
        this.connected = false;
        this.updateUI();
        
        // Пытаемся переподключиться
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Попытка переподключения ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            setTimeout(() => {
                this.tryAutoConnect();
            }, this.reconnectDelay);
        }
    }
    
    async tryAutoConnect() {
        try {
            // Получаем список доступных портов
            const ports = await navigator.serial.getPorts();
            
            if (ports.length > 0) {
                // Пытаемся подключиться к первому доступному порту
                this.port = ports[0];
                await this.port.open({ baudRate: 115200 });
                this.connected = true;
                this.reconnectAttempts = 0;
                this.updateUI();
                this.startReading();
                console.log('Автоматически подключились к COM-порту');
            }
        } catch (error) {
            console.log('Автоподключение не удалось:', error);
        }
    }
    
    handleConnectionError(error) {
        console.error('Ошибка подключения:', error);
        this.connected = false;
        this.updateUI();
        
        // Показываем пользователю сообщение об ошибке
        let errorMessage = 'Ошибка подключения к COM-порту';
        
        if (error.name === 'NotFoundError') {
            errorMessage = 'COM-порт не найден. Проверьте подключение устройства.';
        } else if (error.name === 'SecurityError') {
            errorMessage = 'Нет разрешения на доступ к COM-порту.';
        } else if (error.name === 'InvalidStateError') {
            errorMessage = 'Порт уже открыт или занят.';
        }
        
        this.game.logMessage(`COM: ${errorMessage}`);
        
        // Если была ошибка безопасности, предлагаем проверить настройки
        if (error.name === 'SecurityError') {
            this.showSecurityHelp();
        }
    }
    
    showComNotSupported() {
        this.comStatus.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            Web Serial API не поддерживается вашим браузером<br>
            <small>Используйте Chrome, Edge или Opera 89+</small>
        `;
        this.comStatus.style.background = 'rgba(255, 193, 7, 0.2)';
        this.comStatus.style.borderColor = 'rgba(255, 193, 7, 0.3)';
        this.comStatus.style.color = '#ffc107';
        
        this.comModeBtn.classList.add('disabled');
        this.comModeBtn.disabled = true;
    }
    
    showSecurityHelp() {
        const helpDiv = document.createElement('div');
        helpDiv.className = 'com-security-help';
        helpDiv.innerHTML = `
            <h4><i class="fas fa-shield-alt"></i> Настройка доступа к COM-порту:</h4>
            <ol>
                <li>В адресной строке Chrome введите: <code>chrome://flags/#enable-experimental-web-platform-features</code></li>
                <li>Включите флаг "Experimental Web Platform features"</li>
                <li>Перезапустите браузер</li>
                <li>При подключении разрешите доступ к последовательному порту</li>
            </ol>
        `;
        
        this.comStatus.appendChild(helpDiv);
    }
    
    // Методы для отладки (имитация COM-устройства)
    mockConnect() {
        this.connected = true;
        this.updateUI();
        this.game.logMessage('Тестовое COM-устройство подключено');
        
        // Имитируем получение данных
        this.mockDataStream();
    }
    
    mockDisconnect() {
        this.connected = false;
        this.updateUI();
        this.game.logMessage('Тестовое COM-устройство отключено');
    }
    
    mockDataStream() {
        if (!this.connected) return;
        
        // Имитируем периодическую отправку данных
        setInterval(() => {
            if (this.connected && this.comModeBtn.classList.contains('active')) {
                // Отправляем случайные данные для тестирования
                const mockMessages = [
                    `GAME:${this.game.score}:${this.game.hits}:${this.game.shots}:${this.game.accuracy}:${this.game.timeLeft}`,
                    `CROSSHAIR:${Math.floor(Math.random() * 100)}:${Math.floor(Math.random() * 100)}:0`,
                    `LOG:Тестовое сообщение от COM-устройства`,
                    `GAME_EVENT:TEST:${Date.now()}`
                ];
                
                const randomMessage = mockMessages[Math.floor(Math.random() * mockMessages.length)];
                this.parseMessage(randomMessage);
            }
        }, 3000);
    }
}