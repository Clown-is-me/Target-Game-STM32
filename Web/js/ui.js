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
        
        this.init();
    }
    
    init() {
        // Обработчики кнопок
        this.startBtn.addEventListener('click', () => {
            if (!this.game.gameActive) {
                this.game.startGame();
                this.startBtn.innerHTML = '<i class="fas fa-pause"></i> Пауза';
            } else {
                this.game.pauseGame();
                this.startBtn.innerHTML = this.game.gamePaused ? 
                    '<i class="fas fa-play"></i> Продолжить' : 
                    '<i class="fas fa-pause"></i> Пауза';
            }
        });
        
        this.resetBtn.addEventListener('click', () => {
            this.game.resetGame();
            this.startBtn.innerHTML = '<i class="fas fa-play"></i> Начать игру';
        });
        
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
        
        // Закрытие модального окна при клике вне его
        window.addEventListener('click', (event) => {
            if (event.target === this.resultsModal) {
                this.resultsModal.style.display = 'none';
            }
        });
    }
    
    setControlMode(mode) {
        if (mode === 'keyboard') {
            this.keyboardModeBtn.classList.add('active');
            this.comModeBtn.classList.remove('active');
            
            // В реальном приложении здесь будет переключение логики управления
            console.log('Режим управления: Клавиатура');
        } else if (mode === 'com') {
            // Проверяем, доступно ли COM-устройство
            if (this.comModeBtn.classList.contains('disabled')) {
                alert('COM-устройство не подключено. Используйте режим клавиатуры.');
                return;
            }
            
            this.comModeBtn.classList.add('active');
            this.keyboardModeBtn.classList.remove('active');
            
            // В реальном приложении здесь будет переключение на управление через COM
            console.log('Режим управления: COM-устройство');
        }
    }
    
    updateComStatus(connected, deviceName = '') {
        if (connected) {
            this.comStatus.innerHTML = `<i class="fas fa-check-circle"></i> COM-устройство подключено: ${deviceName}`;
            this.comStatus.style.background = 'rgba(40, 167, 69, 0.2)';
            this.comStatus.style.borderColor = 'rgba(40, 167, 69, 0.3)';
            this.comModeBtn.classList.remove('disabled');
            this.comModeBtn.disabled = false;
        } else {
            this.comStatus.innerHTML = '<i class="fas fa-times-circle"></i> COM-устройство не подключено';
            this.comStatus.style.background = 'rgba(220, 53, 69, 0.2)';
            this.comStatus.style.borderColor = 'rgba(220, 53, 69, 0.3)';
            this.comModeBtn.classList.add('disabled');
            this.comModeBtn.disabled = true;
            
            // Если был активен COM-режим, переключаемся на клавиатуру
            if (this.comModeBtn.classList.contains('active')) {
                this.setControlMode('keyboard');
            }
        }
    }
}