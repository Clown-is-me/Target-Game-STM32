// Класс для управления пользовательским интерфейсом
class GameUI {
    constructor(game) {
        this.game = game;
        
        // Элементы UI
        this.startBtn = document.getElementById('start-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.keyboardModeBtn = document.getElementById('keyboard-mode');
        this.comModeBtn = document.getElementById('com-mode');
        this.comStatus = document.getElementById('com-status');
        this.closeResultsBtn = document.getElementById('close-results');
        this.resultsModal = document.getElementById('results-modal');
        this.shareResultsBtn = document.getElementById('share-results');
        
        this.controlMode = 'keyboard'; // keyboard или com
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
        
        // Закрытие модального окна с результатами
        this.closeResultsBtn.addEventListener('click', () => {
            this.resultsModal.style.display = 'none';
        });
        
        // Кнопка "Поделиться"
        if (this.shareResultsBtn) {
            this.shareResultsBtn.addEventListener('click', () => {
                this.shareResults();
            });
        }
        
        // Закрытие модального окна при клике вне его
        window.addEventListener('click', (event) => {
            if (event.target === this.resultsModal) {
                this.resultsModal.style.display = 'none';
            }
        });
        
        // Инициализируем COM-интерфейс
        this.initCOMInterface();
    }
    
    initCOMInterface() {
        this.comInterface = new COMInterface(this.game, this);
        
        // Автоматическое переключение на COM если устройство подключено
        const checkComStatus = () => {
            if (this.comInterface.connected && this.controlMode !== 'com') {
                this.setControlMode('com');
            }
        };
        
        // Проверяем статус каждые 2 секунды
        setInterval(checkComStatus, 2000);
    }
    
    handleStartClick() {
        if (this.controlMode === 'com' && this.comInterface.connected) {
            // Управление через COM
            if (!this.game.gameActive) {
                this.comInterface.sendGameControl('START');
            } else {
                this.comInterface.sendGameControl('PAUSE');
            }
        } else {
            // Управление клавиатурой
            if (!this.game.gameActive) {
                this.game.startGame();
                this.startBtn.innerHTML = '<i class="fas fa-pause"></i> Пауза';
            } else {
                this.game.pauseGame();
                this.startBtn.innerHTML = this.game.gamePaused ? 
                    '<i class="fas fa-play"></i> Продолжить' : 
                    '<i class="fas fa-pause"></i> Пауза';
            }
        }
    }
    
    handleResetClick() {
        if (this.controlMode === 'com' && this.comInterface.connected) {
            this.comInterface.sendGameControl('RESET');
        } else {
            this.game.resetGame();
            this.startBtn.innerHTML = '<i class="fas fa-play"></i> Начать патруль';
        }
    }
    
    setControlMode(mode) {
        if (mode === 'keyboard') {
            this.controlMode = 'keyboard';
            this.keyboardModeBtn.classList.add('active');
            this.comModeBtn.classList.remove('active');
            
            this.game.logMessage('Режим управления: Клавиатура');
            
            // Отключаем COM управление если было активно
            if (this.game.inputHandler) {
                this.game.inputHandler.enable();
            }
            
        } else if (mode === 'com') {
            if (!this.comInterface.connected) {
                this.game.logMessage('COM-устройство не подключено. Используйте режим клавиатуры.');
                this.setControlMode('keyboard');
                return;
            }
            
            this.controlMode = 'com';
            this.comModeBtn.classList.add('active');
            this.keyboardModeBtn.classList.remove('active');
            
            this.game.logMessage('Режим управления: COM-устройство');
            
            // Отключаем клавиатурное управление
            if (this.game.inputHandler) {
                this.game.inputHandler.disable();
            }
            
            // Запрашиваем текущее состояние игры у COM-устройства
            setTimeout(() => {
                this.comInterface.sendCommand('STATUS');
            }, 500);
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