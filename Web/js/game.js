class ShipGame {
    constructor() {
        // Игровые параметры
        this.score = 0;
        this.hits = 0;
        this.shots = 0;
        this.gameTime = 60; // секунды
        this.timeLeft = this.gameTime;
        this.gameActive = false;
        this.gamePaused = false;
        this.crosshairLocked = false;
        this.crosshairSpeed = 6; // Скорость движения прицела
        this.crosshairVerticalSpeed = 3;
        this.crosshairVerticalDirection = 1;
        
        // Управление (используется InputHandler)
        this.moveLeft = false;
        this.moveRight = false;
        this.keyboardEnabled = true;
        
        // Типы кораблей и их очки
        this.shipTypes = [
            { class: 'small', points: 10, spawnChance: 0.5 },
            { class: 'medium', points: 20, spawnChance: 0.3 },
            { class: 'large', points: 30, spawnChance: 0.2 }
        ];
        
        // Элементы DOM
        this.gameField = document.getElementById('game-field');
        this.crosshair = document.getElementById('crosshair');
        this.scoreElement = document.getElementById('score');
        this.hitsElement = document.getElementById('hits');
        this.shotsElement = document.getElementById('shots');
        this.accuracyElement = document.getElementById('accuracy');
        this.timeElement = document.getElementById('time');
        this.gameStateText = document.getElementById('game-state-text');
        this.crosshairState = document.getElementById('crosshair-state');
        this.timerProgress = document.getElementById('timer-progress');
        this.timeDisplay = document.getElementById('time-display');
        
        // Размеры игрового поля
        this.fieldRect = null;
        this.fieldWidth = 0;
        this.fieldHeight = 0;
        
        // Массив кораблей
        this.ships = [];
        
        // Таймеры
        this.gameTimer = null;
        this.crosshairMoveTimer = null;
        this.shipSpawnTimer = null;
        this.gameLoop = null;
        
        // Привязка контекста только для тех методов, которые существуют
        this.updateFieldSize = this.updateFieldSize.bind(this);
        
        this.init();
    }
    
    init() {
        // Обновляем размеры поля
        window.addEventListener('resize', this.updateFieldSize);
        this.updateFieldSize();
        
        // Устанавливаем начальное положение прицела
        this.resetCrosshair();
        
        // Запускаем игровой цикл
        this.startGameLoop();
        
        // Логирование
        this.logMessage('Система инициализирована');
        this.logMessage('Гарнизон готов к патрулю');
    }

    enableKeyboard() {
        this.keyboardEnabled = true;
        this.logMessage('Клавиатурное управление включено');
    }

    disableKeyboard() {
        this.keyboardEnabled = false;
        // Сбрасываем состояния клавиш
        this.moveLeft = false;
        this.moveRight = false;
        this.logMessage('Клавиатурное управление отключено');
    }
    
    startGameLoop() {
        const update = () => {
            this.updateCrosshairPosition();
            requestAnimationFrame(update);
        };
        this.gameLoop = requestAnimationFrame(update);
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
        this.hits = 0;
        this.shots = 0;
        this.timeLeft = this.gameTime;
        
        this.updateUI();
        this.clearShips();
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
        
        // Запускаем появление кораблей
        this.startSpawningShips();
        
        this.gameStateText.textContent = 'Патрулирование в процессе!';
        this.gameStateText.style.color = '#82b9bf';
        
        this.logMessage('Начато патрулирование акватории');
    }
    
    pauseGame() {
        if (!this.gameActive) return;
        
        this.gamePaused = !this.gamePaused;
        
        if (this.gamePaused) {
            this.gameStateText.textContent = 'Патруль на причале';
            this.gameStateText.style.color = '#9c7b6d';
            this.logMessage('Патруль приостановлен');
        } else {
            this.gameStateText.textContent = 'Патрулирование в процессе!';
            this.gameStateText.style.color = '#82b9bf';
            this.logMessage('Патруль возобновлен');
        }
    }
    
    endGame() {
        this.gameActive = false;
        this.crosshairLocked = false;
        
        if (this.crosshairMoveTimer) {
            clearInterval(this.crosshairMoveTimer);
            this.crosshairMoveTimer = null;
        }
        
        clearInterval(this.gameTimer);
        clearInterval(this.shipSpawnTimer);
        
        this.gameTimer = null;
        this.shipSpawnTimer = null;
        
        this.gameStateText.textContent = 'Патруль завершён';
        this.gameStateText.style.color = '#3a5361';
        
        this.logMessage('Патруль завершен');
        
        // Показываем результаты
        this.showResults();
    }
    
    resetGame() {
        this.endGame();
        this.score = 0;
        this.hits = 0;
        this.shots = 0;
        this.timeLeft = this.gameTime;
        this.clearShips();
        this.resetCrosshair();
        this.updateUI();
        
        this.gameStateText.textContent = 'Гарнизон готов к патрулю';
        this.gameStateText.style.color = '#82b9bf';
        
        this.logMessage('Новый патруль подготовлен');
    }
    
    startSpawningShips() {
        this.clearShips();
        
        // Создаем первый корабль сразу
        this.spawnShip();
        
        // Запускаем таймер появления кораблей
        this.shipSpawnTimer = setInterval(() => {
            if (!this.gamePaused && this.gameActive) {
                if (this.ships.length < 8) { // Максимум 8 кораблей одновременно
                    this.spawnShip();
                }
            }
        }, 2000);
    }
    
    spawnShip() {
        if (!this.gameActive || this.gamePaused) return;
        
        // Выбираем тип корабля на основе вероятности
        const rand = Math.random();
        let cumulative = 0;
        let shipType;
        
        for (const type of this.shipTypes) {
            cumulative += type.spawnChance;
            if (rand <= cumulative) {
                shipType = type;
                break;
            }
        }
        
        // Создаем элемент корабля
        const ship = document.createElement('img');
        ship.className = `ship ${shipType.class} appearing`;
        ship.dataset.points = shipType.points;
        if (shipType.class === 'small') {
            ship.src = 'assets/ship-small.png';
        } else if (shipType.class === 'medium') {
            ship.src = 'assets/ship-medium.png';
        } else {
            ship.src = 'assets/ship-large.png';
        }

        ship.alt = 'Корабль';
        ship.style.cursor = 'default';
        
        // Убираем обработчики клика - управление только клавиатурой
        ship.style.cursor = 'default';
        ship.onclick = null;
        
        // Генерируем случайную позицию
        const size = shipType.class === 'small' ? 50 : 
                     shipType.class === 'medium' ? 70 : 90;
        const maxX = this.fieldWidth - size - 40;
        const maxY = this.fieldHeight - size - 100;
        
        const x = 20 + Math.random() * maxX;
        const y = 20 + Math.random() * maxY;
        
        ship.style.left = `${x}px`;
        ship.style.top = `${y}px`;
        
        // Добавляем корабль на поле
        this.gameField.appendChild(ship);
        this.ships.push({
            element: ship,
            points: shipType.points,
            x: x,
            y: y
        });
        
        // Логируем появление
        const shipName = this.getShipNameByPoints(shipType.points);
        this.logMessage(`Обнаружена ${shipName} по курсу ${Math.floor(x)}`);
        
        // Убираем класс анимации после её завершения
        setTimeout(() => {
            ship.classList.remove('appearing');
        }, 500);
    }
    
    getShipNameByPoints(points) {
        switch(points) {
            case 10: return 'шхуна';
            case 20: return 'бриг';
            case 30: return 'фрегат';
            default: return 'судно';
        }
    }
    
    clearShips() {
        const ships = this.gameField.querySelectorAll('.ship');
        ships.forEach(ship => {
            ship.remove();
        });
        
        this.ships = [];
    }
    
    // Исправленный метод updateCrosshairPosition
    updateCrosshairPosition() {
        if (!this.gameActive || this.gamePaused || this.crosshairLocked) return;
        
        // Проверяем, нужно ли двигать прицел
        let shouldMove = false;
        let moveDirection = 0;
        
        if (this.moveLeft && !this.moveRight) {
            moveDirection = -1;
            shouldMove = true;
        } else if (this.moveRight && !this.moveLeft) {
            moveDirection = 1;
            shouldMove = true;
        }
        
        if (shouldMove) {
            const currentLeft = parseInt(this.crosshair.style.left) || this.fieldWidth / 2;
            const newLeft = currentLeft + (moveDirection * this.crosshairSpeed);
            
            // Ограничиваем движение в пределах поля
            const minX = 40;
            const maxX = this.fieldWidth - 40;
            
            if (newLeft >= minX && newLeft <= maxX) {
                this.crosshair.style.left = `${newLeft}px`;
            }
        }
    }
    
    lockCrosshair() {
        if (!this.gameActive || this.gamePaused || this.crosshairLocked) return;
        
        this.crosshairLocked = true;
        this.updateCrosshairState();
        
        this.logMessage('Курс зафиксирован. Автоматическое вертикальное движение');
        
        // Запускаем автоматическое движение прицела по вертикали
        this.startCrosshairAutoMove();
    }
    
    startCrosshairAutoMove() {
        if (this.crosshairMoveTimer) {
            clearInterval(this.crosshairMoveTimer);
        }
        
        this.crosshairMoveTimer = setInterval(() => {
            if (!this.gameActive || this.gamePaused || !this.crosshairLocked) {
                this.stopCrosshairAutoMove();
                return;
            }
            
            // Движение по вертикали (вверх-вниз)
            const currentTop = parseInt(this.crosshair.style.top) || this.fieldHeight / 2;
            let newTop = currentTop + (this.crosshairVerticalDirection * this.crosshairVerticalSpeed);
            
            // Меняем направление при достижении границы
            const minY = 40;
            const maxY = this.fieldHeight - 40;
            
            if (newTop <= minY) {
                newTop = minY;
                this.crosshairVerticalDirection = 1;
            } else if (newTop >= maxY) {
                newTop = maxY;
                this.crosshairVerticalDirection = -1;
            }
            
            this.crosshair.style.top = `${newTop}px`;
        }, 16);
    }
    
    stopCrosshairAutoMove() {
        if (this.crosshairMoveTimer) {
            clearInterval(this.crosshairMoveTimer);
            this.crosshairMoveTimer = null;
        }
    }
    
    fire() {
        if (!this.gameActive || this.gamePaused || !this.crosshairLocked) return;
        
        this.shots++;
        this.logMessage(`Выстрел произведен (всего: ${this.shots})`);
        
        // Проверяем попадание в корабли
        const hit = this.checkHit();
        
        if (hit) {
            this.logMessage('Попадание!');
        } else {
            // Эффект промаха
            this.createMissEffect();
            this.logMessage('Промах!');
        }
        
        // Снимаем фиксацию прицела после выстрела
        this.crosshairLocked = false;
        this.stopCrosshairAutoMove();
        
        this.updateCrosshairState();
        this.updateUI();
    }
    
    checkHit() {
        const crosshairRect = this.crosshair.getBoundingClientRect();
        const crosshairCenterX = crosshairRect.left + crosshairRect.width / 2;
        const crosshairCenterY = crosshairRect.top + crosshairRect.height / 2;
        
        let hitDetected = false;
        
        // Проверяем каждый корабль на попадание
        for (const ship of this.ships) {
            const shipRect = ship.element.getBoundingClientRect();
            const shipCenterX = shipRect.left + shipRect.width / 2;
            const shipCenterY = shipRect.top + shipRect.height / 2;
            
            // Рассчитываем расстояние между центрами
            const distance = Math.sqrt(
                Math.pow(crosshairCenterX - shipCenterX, 2) + 
                Math.pow(crosshairCenterY - shipCenterY, 2)
            );
            
            // Если расстояние меньше радиуса корабля, считаем попадание
            const shipRadius = shipRect.width / 2;
            if (distance < shipRadius) {
                this.processHit(ship);
                hitDetected = true;
                break; // Попадание только в один корабль за выстрел
            }
        }
        
        return hitDetected;
    }
    
    processHit(shipData) {
        // Визуальный эффект попадания
        this.createSplashEffect(shipData.element);
        
        // Добавляем очки
        this.score += shipData.points;
        this.hits++;
        
        // Логируем попадание
        const shipName = this.getShipNameByPoints(shipData.points);
        this.logMessage(`Потоплена ${shipName}! +${shipData.points} очков`);
        
        // Визуальный эффект потопления
        shipData.element.classList.add('hit');
        
        // Удаляем корабль из массива
        const shipIndex = this.ships.indexOf(shipData);
        if (shipIndex > -1) {
            this.ships.splice(shipIndex, 1);
        }
        
        // Удаляем элемент после анимации
        setTimeout(() => {
            if (shipData.element.parentNode) {
                shipData.element.parentNode.removeChild(shipData.element);
            }
        }, 800);
    }
    
    createSplashEffect(shipElement) {
        const rect = shipElement.getBoundingClientRect();
        const fieldRect = this.gameField.getBoundingClientRect();
        
        const splash = document.createElement('div');
        splash.className = 'splash';
        
        const x = rect.left + rect.width / 2 - fieldRect.left;
        const y = rect.top + rect.height / 2 - fieldRect.top;
        
        splash.style.left = `${x - 20}px`;
        splash.style.top = `${y - 20}px`;
        
        this.gameField.appendChild(splash);
        
        setTimeout(() => {
            if (splash.parentNode) {
                splash.parentNode.removeChild(splash);
            }
        }, 600);
    }
    
    createMissEffect() {
        const crosshairRect = this.crosshair.getBoundingClientRect();
        const fieldRect = this.gameField.getBoundingClientRect();
        
        const ripple = document.createElement('div');
        ripple.className = 'splash';
        ripple.style.background = 'radial-gradient(circle, white 0%, rgba(130, 185, 191, 0.7) 100%)';
        
        const x = crosshairRect.left + crosshairRect.width / 2 - fieldRect.left;
        const y = crosshairRect.top + crosshairRect.height / 2 - fieldRect.top;
        
        ripple.style.left = `${x - 20}px`;
        ripple.style.top = `${y - 20}px`;
        
        this.gameField.appendChild(ripple);
        
        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 600);
    }
    
    updateUI() {
        this.scoreElement.textContent = this.score;
        this.hitsElement.textContent = this.hits;
        this.shotsElement.textContent = this.shots;
        
        // Рассчитываем точность
        const accuracy = this.shots > 0 ? 
            Math.round((this.hits / this.shots) * 100) : 0;
        this.accuracyElement.textContent = `${accuracy}%`;
        
        // Цвет точности в зависимости от значения
        if (accuracy >= 80) {
            this.accuracyElement.style.color = '#82b9bf';
        } else if (accuracy >= 50) {
            this.accuracyElement.style.color = '#9c7b6d';
        } else {
            this.accuracyElement.style.color = '#5e6f77';
        }
        
        this.timeElement.textContent = `${this.timeLeft}с`;
        this.timeDisplay.textContent = `${this.timeLeft}с`;
        
        // Обновляем прогресс таймера
        const progress = (this.timeLeft / this.gameTime) * 100;
        this.timerProgress.style.width = `${progress}%`;
        
        // Цвет времени в зависимости от оставшегося времени
        if (this.timeLeft <= 10) {
            this.timeElement.style.color = '#5e6f77';
            this.timerProgress.style.background = 'linear-gradient(90deg, #5e6f77 0%, #7a8b94 100%)';
        } else if (this.timeLeft <= 30) {
            this.timeElement.style.color = '#9c7b6d';
            this.timerProgress.style.background = 'linear-gradient(90deg, #9c7b6d 0%, #b4988a 100%)';
        } else {
            this.timeElement.style.color = '#82b9bf';
            this.timerProgress.style.background = 'linear-gradient(90deg, #82b9bf 0%, #a3d2d8 100%)';
        }
    }
    
    updateCrosshairState() {
        if (this.crosshairLocked) {
            this.crosshairState.innerHTML = '<i class="fas fa-crosshairs"></i><span>Прицел: Курс зафиксирован (движется вертикально)</span>';
            this.crosshairState.style.color = '#9c7b6d';
        } else {
            this.crosshairState.innerHTML = '<i class="fas fa-crosshairs"></i><span>Прицел: Свободное плавание (A/D для движения)</span>';
            this.crosshairState.style.color = '#82b9bf';
        }
    }
    
    logMessage(message) {
        const logContent = document.querySelector('.log-content');
        const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;

        const systemKeywords = [
            'Система инициализирована',
            'Гарнизон готов',
            'Начато патрулирование',
            'Патруль приостановлен',
            'Патруль возобновлен',
            'Патруль завершен',
            'Новый патруль подготовлен',
            'Режим управления',
            'COM',
            'Курс зафиксирован',
            'Журнал очищен',
            'Ошибка'
        ];

        const isSystemMessage = systemKeywords.some(keyword => message.includes(keyword));

        if (isSystemMessage) {
            console.log(`[Журнал] ${message}`);
        }
        
        // Ограничиваем количество записей
        const entries = logContent.querySelectorAll('.log-entry');
        if (entries.length > 10) {
            entries[0].remove();
        }
    }
    
    showResults() {
        const accuracy = this.shots > 0 ? 
            Math.round((this.hits / this.shots) * 100) : 0;
        
        // Определяем звание по точности
        let rank = 'Юнга';
        if (accuracy >= 90) rank = 'Адмирал';
        else if (accuracy >= 75) rank = 'Капитан';
        else if (accuracy >= 50) rank = 'Лейтенант';
        else if (accuracy >= 25) rank = 'Матрос';
        
        // Заполняем данные в модальном окне
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('final-accuracy').textContent = `${accuracy}%`;
        document.getElementById('final-hits').textContent = this.hits;
        document.getElementById('final-time').textContent = `${this.gameTime - this.timeLeft}с`;
        
        const rankBadge = document.getElementById('rank-badge');
        const rankTitle = rankBadge.querySelector('.rank-title') || document.createElement('span');
        rankTitle.className = 'rank-title';
        rankTitle.textContent = rank;
        rankBadge.innerHTML = '';
        rankBadge.appendChild(rankTitle);
        
        // Логируем результаты
        this.logMessage(`Патруль завершен. Звание: ${rank}, Точность: ${accuracy}%`);
        
        // Показываем модальное окно
        document.getElementById('results-modal').style.display = 'flex';
    }
}