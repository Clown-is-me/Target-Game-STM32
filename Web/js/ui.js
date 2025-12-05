class GameUI {
    constructor(game) {
        this.game = game;
        
        // Элементы UI
        this.startBtn = document.getElementById('start-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.keyboardModeBtn = document.getElementById('keyboard-mode');
        this.comModeBtn = document.getElementById('com-mode');
        this.closeResultsBtn = document.getElementById('close-results');
        this.resultsModal = document.getElementById('results-modal');
        
        this.controlMode = 'keyboard'; // По умолчанию клавиатура
        this.comInterface = null;
        
        this.init();
    }
    
    init() {
        // Обработчики кнопок
        this.startBtn.addEventListener('click', () => this.handleStartClick());
        this.resetBtn.addEventListener('click', () => this.handleResetClick());
        
        // Переключение режимов управления
        this.keyboardModeBtn.addEventListener('click', () => {
            this.setControlMode('keyboard');
        });
        
        this.comModeBtn.addEventListener('click', () => {
            this.setControlMode('com');
        });
        
        // Закрытие модального окна
        this.closeResultsBtn.addEventListener('click', () => {
            this.resultsModal.style.display = 'none';
        });
        
        // Закрытие модального окна при клике вне его
        window.addEventListener('click', (event) => {
            if (event.target === this.resultsModal) {
                this.resultsModal.style.display = 'none';
            }
        });
        
        // Инициализируем COM-интерфейс
        this.initCOMInterface();
    }
    
    // В методе initCOMInterface класса GameUI обновляем:
    initCOMInterface() {
        // Проверяем, существует ли класс COMInterface
        if (typeof COMInterface === 'undefined') {
            console.warn('COMInterface не загружен. COM-управление недоступно.');
            return;
        }
        
        this.comInterface = new COMInterface(this.game, this);
    }

    // В методе handleStartClick класса GameUI обновляем:
    handleStartClick() {
        if (!this.game.gameActive) {
            this.game.startGame();
            this.startBtn.innerHTML = '<i class="fas fa-pause"></i> Пауза';
            // Отправляем START на плату, если режим COM
            if (this.controlMode === 'com' && this.comInterface) {
                this.comInterface.sendCommand('START');
            }
        } else {
            this.game.pauseGame();
            this.startBtn.innerHTML = this.game.gamePaused 
                ? '<i class="fas fa-play"></i> Продолжить' 
                : '<i class="fas fa-pause"></i> Пауза';
            // Отправляем PAUSE/START на плату
            if (this.controlMode === 'com' && this.comInterface) {
                this.comInterface.sendCommand(this.game.gamePaused ? 'PAUSE' : 'START');
            }
        }
    }

    // В методе handleResetClick класса GameUI:
    handleResetClick() {
        this.game.resetGame();
        this.startBtn.innerHTML = '<i class="fas fa-play"></i> Начать патруль';
        if (this.controlMode === 'com' && this.comInterface) {
            this.comInterface.sendCommand('RESET');
        }
    }
    
    setControlMode(mode) {
        // ВСЕГДА сбрасываем игру при смене режима
        this.game.resetGame();

        if (mode === 'keyboard') {
            this.controlMode = 'keyboard';
            this.keyboardModeBtn.classList.add('active');
            this.comModeBtn.classList.remove('active');
            this.game.useComTimer = false;
            if (this.game.inputHandler) {
                this.game.inputHandler.enable();
            }
            this.game.logMessage('Режим управления: Клавиатура. Таймер на веб-части.');
        } else if (mode === 'com') {
            if (!this.comInterface || !this.comInterface.connected) {
                this.game.logMessage('COM-устройство не подключено. Переключаюсь на клавиатуру.');
                this.setControlMode('keyboard');
                return;
            }
            this.controlMode = 'com';
            this.comModeBtn.classList.add('active');
            this.keyboardModeBtn.classList.remove('active');
            this.game.useComTimer = true;
            if (this.game.inputHandler) {
                this.game.inputHandler.disable();
            }
            this.game.logMessage('Режим управления: COM-устройство. Таймер на плате.');
        }
    }
    
    updateComStatus(connected, deviceName = '') {
        // Этот метод теперь управляется COMInterface
        // Оставляем для совместимости
        console.log('updateComStatus вызван, но управляется COMInterface');
    }
    
    shareResults() {
        
    }
    
    // Метод для отображения уведомлений
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            <span>${message}</span>
            <button class="notification-close"><i class="fas fa-times"></i></button>
        `;
        
        document.body.appendChild(notification);
        
        // Анимация появления
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Закрытие по кнопке
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        });
        
        // Автоматическое закрытие через 5 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.remove('show');
                setTimeout(() => {
                    notification.remove();
                }, 300);
            }
        }, 5000);
    }
}