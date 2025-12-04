// Класс для управления пользовательским интерфейсом
class GameUI {
    constructor(game) {
        this.game = game;
        
        // Элементы UI
        this.startBtn = document.getElementById('start-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.closeResultsBtn = document.getElementById('close-results');
        this.shareResultsBtn = document.getElementById('share-results');
        this.resultsModal = document.getElementById('results-modal');
        
        this.init();
    }
    
    init() {
        // Обработчики кнопок
        this.startBtn.addEventListener('click', () => {
            if (!this.game.gameActive) {
                this.game.startGame();
                this.startBtn.innerHTML = '<i class="fas fa-pause"></i> Причалить';
            } else {
                this.game.pauseGame();
                this.startBtn.innerHTML = this.game.gamePaused ? 
                    '<i class="fas fa-play"></i> Сняться с якоря' : 
                    '<i class="fas fa-pause"></i> Причалить';
            }
        });
        
        this.resetBtn.addEventListener('click', () => {
            this.game.resetGame();
            this.startBtn.innerHTML = '<i class="fas fa-play"></i> Начать патруль';
        });
        
        // Закрытие модального окна с результатами
        this.closeResultsBtn.addEventListener('click', () => {
            this.resultsModal.style.display = 'none';
        });
        
        // Кнопка "Поделиться"
        this.shareResultsBtn.addEventListener('click', () => {
            this.shareResults();
        });
        
        // Закрытие модального окна при клике вне его
        window.addEventListener('click', (event) => {
            if (event.target === this.resultsModal) {
                this.resultsModal.style.display = 'none';
            }
        });
    }
    
    shareResults() {
        const score = document.getElementById('final-score').textContent;
        const accuracy = document.getElementById('final-accuracy').textContent;
        const rank = document.getElementById('rank').textContent;
        
        const text = `🏆 Я только что завершил морской патруль в игре "Морская Охотничья Застава"!
🎯 Счёт: ${score}
🎯 Точность: ${accuracy}
⚓ Звание: ${rank}
🚢 Сможешь побить мой рекорд?`;

        if (navigator.share) {
            navigator.share({
                title: 'Мой результат в Морской Охотничьей Заставе',
                text: text,
                url: window.location.href
            });
        } else {
            // Копируем в буфер обмена
            navigator.clipboard.writeText(text).then(() => {
                alert('Результаты скопированы в буфер обмена! Поделитесь ими с друзьями.');
            });
        }
    }
}