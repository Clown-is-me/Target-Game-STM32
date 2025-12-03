// Основной игровой класс
class TargetGame {
    constructor() {
        // Игровые параметры
        this.score = 0;
        this.targetsHit = 0;
        this.totalTargets = 10;
        this.gameTime = 60; // секунды
        this.timeLeft = this.gameTime;
        this.gameActive = false;
        this.gamePaused = false;
        this.crosshairLocked = false;
        this.crosshairDirection = 1; // 1 - вправо, -1 - влево
        this.crosshairSpeed = 3;
        
        // Элементы DOM
        this.gameField = document.getElementById('game-field');
        this.crosshair = document.getElementById('crosshair');
        this.scoreElement = document.getElementById('score');
        this.targetsHitElement = document.getElementById('targets-hit');
        this.timeElement = document.getElementById('time');
        this.gameStateText = document.getElementById('game-state-text');
        this.crosshairState = document.getElementById('crosshair-state');
        
        // Размеры игрового поля
        this.fieldRect = this.gameField.getBoundingClientRect();
        this.fieldWidth = this.fieldRect.width;
        this.fieldHeight = this.fieldRect.height;
        
        // Массив мишеней
        this.targets = [];
        
        // Таймеры
        this.gameTimer = null;
        this.crosshairMoveTimer = null;
        this.targetSpawnTimer = null;
        
        // Привязка контекста для обработчиков событий
        this.updateFieldSize = this.updateFieldSize.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        
        this.init();
    }
    
    init() {
        // Обновляем размеры поля при изменении размера окна
        window.addEventListener('resize', this.updateFieldSize);
        this.updateFieldSize();
        
        // Устанавливаем начальное положение прицела
        this.resetCrosshair();
    }
    
    updateFieldSize() {
        this.fieldRect = this.gameField.getBoundingClientRect();
        this.fieldWidth = this.fieldRect.width;
        this.fieldHeight = this.fieldRect.height;
    }
    
    resetCrosshair() {
        const x = this.fieldWidth / 2;
        const y = this.fieldHeight / 2;
        this.crosshair.style.left = `${x}px`;
        this.crosshair.style.top = `${y}px`;
        this.crosshairLocked = false;
        this.updateCrosshairState();
    }
    
    startGame() {
        if (this.gameActive) return;
        
        this.gameActive = true;
        this.gamePaused = false;
        this.score = 0;
        this.targetsHit = 0;
        this.timeLeft = this.gameTime;
        
        this.updateUI();
        this.clearTargets();
        this.resetCrosshair();
        
        // Запускаем таймер игры
        this.gameTimer = setInterval(() => {
            if (!this.gamePaused) {
                this.timeLeft--;
                this.updateUI();
                
                if (this.timeLeft <= 0) {
                    this.endGame();
                }
            }
        }, 1000);
        
        // Запускаем появление мишеней
        this.startSpawningTargets();
        
        this.gameStateText.textContent = 'Игра идет!';
        this.gameStateText.style.color = '#4cc9f0';
    }
    
    pauseGame() {
        if (!this.gameActive) return;
        
        this.gamePaused = !this.gamePaused;
        
        if (this.gamePaused) {
            this.gameStateText.textContent = 'Игра на паузе';
            this.gameStateText.style.color = '#ffa502';
            clearInterval(this.crosshairMoveTimer);
            this.crosshairMoveTimer = null;
        } else {
            this.gameStateText.textContent = 'Игра идет!';
            this.gameStateText.style.color = '#4cc9f0';
            
            // Если прицел был зафиксирован, возобновляем движение
            if (this.crosshairLocked) {
                this.startCrosshairAutoMove();
            }
        }
    }
    
    endGame() {
        this.gameActive = false;
        clearInterval(this.gameTimer);
        clearInterval(this.crosshairMoveTimer);
        clearInterval(this.targetSpawnTimer);
        
        this.gameTimer = null;
        this.crosshairMoveTimer = null;
        this.targetSpawnTimer = null;
        
        this.gameStateText.textContent = 'Игра завершена';
        this.gameStateText.style.color = '#ff4757';
        
        // Показываем результаты
        this.showResults();
    }
    
    resetGame() {
        this.endGame();
        this.score = 0;
        this.targetsHit = 0;
        this.timeLeft = this.gameTime;
        this.clearTargets();
        this.resetCrosshair();
        this.updateUI();
        
        this.gameStateText.textContent = 'Ожидание начала игры';
        this.gameStateText.style.color = '#4cc9f0';
    }
    
    startSpawningTargets() {
        // Очищаем существующие мишени
        this.clearTargets();
        
        // Создаем первую мишень сразу
        this.spawnTarget();
        
        // Запускаем таймер появления мишеней
        this.targetSpawnTimer = setInterval(() => {
            if (!this.gamePaused && this.gameActive) {
                if (this.targets.length < 5) { // Максимум 5 мишеней одновременно
                    this.spawnTarget();
                }
            }
        }, 1500);
    }
    
    spawnTarget() {
        if (!this.gameActive || this.gamePaused) return;
        
        // Создаем элемент мишени
        const target = document.createElement('div');
        target.className = 'target';
        
        // Генерируем случайную позицию
        const size = 60;
        const maxX = this.fieldWidth - size;
        const maxY = this.fieldHeight - size;
        
        const x = Math.random() * maxX;
        const y = Math.random() * maxY;
        
        target.style.left = `${x}px`;
        target.style.top = `${y}px`;
        
        // Добавляем номер мишени
        const targetNumber = this.targets.length + 1;
        target.textContent = targetNumber;
        target.dataset.id = targetNumber;
        
        // Добавляем обработчик клика (для отладки)
        target.addEventListener('click', () => {
            if (this.gameActive && !this.gamePaused) {
                this.hitTarget(target);
            }
        });
        
        // Добавляем мишень на поле и в массив
        this.gameField.appendChild(target);
        this.targets.push({
            element: target,
            id: targetNumber,
            x: x,
            y: y
        });
    }
    
    hitTarget(targetElement) {
        if (!this.gameActive || this.gamePaused) return;
        
        // Визуальный эффект попадания
        targetElement.classList.add('hit');
        
        // Увеличиваем счет
        this.score += 10;
        this.targetsHit++;
        
        // Обновляем UI
        this.updateUI();
        
        // Удаляем мишень из массива и DOM
        const targetId = parseInt(targetElement.dataset.id);
        this.targets = this.targets.filter(t => t.id !== targetId);
        
        // Удаляем элемент после анимации
        setTimeout(() => {
            if (targetElement.parentNode) {
                targetElement.parentNode.removeChild(targetElement);
            }
        }, 500);
        
        // Проверяем условие победы
        if (this.targetsHit >= this.totalTargets) {
            setTimeout(() => {
                this.endGame();
            }, 1000);
        }
    }
    
    clearTargets() {
        // Удаляем все мишени из DOM
        const targets = this.gameField.querySelectorAll('.target');
        targets.forEach(target => {
            target.remove();
        });
        
        // Очищаем массив мишеней
        this.targets = [];
    }
    
    moveCrosshair(direction) {
        if (!this.gameActive || this.gamePaused || this.crosshairLocked) return;
        
        const currentLeft = parseInt(this.crosshair.style.left) || this.fieldWidth / 2;
        const newLeft = currentLeft + (direction * 10); // Шаг движения
        
        // Ограничиваем движение в пределах поля
        if (newLeft >= 20 && newLeft <= this.fieldWidth - 20) {
            this.crosshair.style.left = `${newLeft}px`;
            
            // Проверяем попадание в мишени (автоматическое)
            this.checkAutoHit();
        }
    }
    
    lockCrosshair() {
        if (!this.gameActive || this.gamePaused || this.crosshairLocked) return;
        
        this.crosshairLocked = true;
        this.updateCrosshairState();
        
        // Запускаем автоматическое движение прицела
        this.startCrosshairAutoMove();
    }
    
    startCrosshairAutoMove() {
        if (this.crosshairMoveTimer) {
            clearInterval(this.crosshairMoveTimer);
        }
        
        this.crosshairMoveTimer = setInterval(() => {
            if (!this.gameActive || this.gamePaused || !this.crosshairLocked) {
                clearInterval(this.crosshairMoveTimer);
                this.crosshairMoveTimer = null;
                return;
            }
            
            const currentLeft = parseInt(this.crosshair.style.left) || this.fieldWidth / 2;
            let newLeft = currentLeft + (this.crosshairDirection * this.crosshairSpeed);
            
            // Меняем направление при достижении границы
            if (newLeft <= 20) {
                newLeft = 20;
                this.crosshairDirection = 1;
            } else if (newLeft >= this.fieldWidth - 20) {
                newLeft = this.fieldWidth - 20;
                this.crosshairDirection = -1;
            }
            
            this.crosshair.style.left = `${newLeft}px`;
            
            // Проверяем попадание в мишени (автоматическое)
            this.checkAutoHit();
        }, 16); // ~60 FPS
    }
    
    fire() {
        if (!this.gameActive || this.gamePaused || !this.crosshairLocked) return;
        
        // Проверяем попадание в мишени
        this.checkHit();
        
        // Снимаем фиксацию прицела после выстрела
        this.crosshairLocked = false;
        clearInterval(this.crosshairMoveTimer);
        this.crosshairMoveTimer = null;
        
        this.updateCrosshairState();
    }
    
    checkAutoHit() {
        // Автоматическая проверка попадания при движении прицела
        // (можно использовать для упрощения игры или как отдельный режим)
        // В текущей реализации проверка выполняется только при выстреле
    }
    
    checkHit() {
        const crosshairRect = this.crosshair.getBoundingClientRect();
        const crosshairCenterX = crosshairRect.left + crosshairRect.width / 2;
        const crosshairCenterY = crosshairRect.top + crosshairRect.height / 2;
        
        // Проверяем каждую мишень на попадание
        this.targets.forEach(target => {
            const targetRect = target.element.getBoundingClientRect();
            const targetCenterX = targetRect.left + targetRect.width / 2;
            const targetCenterY = targetRect.top + targetRect.height / 2;
            
            // Рассчитываем расстояние между центрами прицела и мишени
            const distance = Math.sqrt(
                Math.pow(crosshairCenterX - targetCenterX, 2) + 
                Math.pow(crosshairCenterY - targetCenterY, 2)
            );
            
            // Если расстояние меньше радиуса мишени, считаем попадание
            const targetRadius = targetRect.width / 2;
            if (distance < targetRadius) {
                this.hitTarget(target.element);
            }
        });
    }
    
    updateUI() {
        this.scoreElement.textContent = this.score;
        this.targetsHitElement.textContent = `${this.targetsHit}/${this.totalTargets}`;
        this.timeElement.textContent = `${this.timeLeft}с`;
    }
    
    updateCrosshairState() {
        if (this.crosshairLocked) {
            this.crosshairState.textContent = 'Прицел зафиксирован (движется автоматически)';
            this.crosshairState.style.color = '#ffa502';
        } else {
            this.crosshairState.textContent = 'Прицел свободен (управляется клавишами A/D)';
            this.crosshairState.style.color = '#2ed573';
        }
    }
    
    showResults() {
        const accuracy = this.targetsHit > 0 ? 
            Math.round((this.targetsHit / this.totalTargets) * 100) : 0;
        
        // Заполняем данные в модальном окне
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('accuracy').textContent = `${accuracy}%`;
        document.getElementById('final-time').textContent = `${this.gameTime - this.timeLeft}с`;
        
        // Показываем модальное окно
        document.getElementById('results-modal').style.display = 'flex';
    }
    
    handleKeyDown(event) {
        // Игнорируем повторные нажатия
        if (event.repeat) return;
        
        switch(event.code) {
            case 'KeyA':
                this.moveCrosshair(-1);
                break;
            case 'KeyD':
                this.moveCrosshair(1);
                break;
            case 'Space':
                if (!this.crosshairLocked) {
                    this.lockCrosshair();
                } else {
                    this.fire();
                }
                event.preventDefault(); // Предотвращаем прокрутку страницы
                break;
            case 'Escape':
                this.pauseGame();
                break;
        }
    }
    
    // Метод для внешнего управления (например, из COM-устройства)
    moveCrosshairTo(x) {
        if (!this.gameActive || this.gamePaused || this.crosshairLocked) return;
        
        // Нормализуем координату x (ожидается значение от 0 до 100)
        const normalizedX = Math.max(0, Math.min(100, x));
        
        // Конвертируем в пиксели
        const pixelX = (normalizedX / 100) * this.fieldWidth;
        
        // Ограничиваем движение в пределах поля
        if (pixelX >= 20 && pixelX <= this.fieldWidth - 20) {
            this.crosshair.style.left = `${pixelX}px`;
        }
    }
    
    // Метод для внешнего управления (например, из COM-устройства)
    externalFire() {
        this.fire();
    }
    
    // Метод для внешнего управления (например, из COM-устройства)
    externalLock() {
        this.lockCrosshair();
    }
}