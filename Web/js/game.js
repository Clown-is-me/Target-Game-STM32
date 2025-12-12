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
        this.comCrosshairX = null;
        this.comCrosshairY = null; // ← новая переменная
        this.useComTimer = false; // Управление таймером через COM
        // --- Комбо ---
        this.comboCount = 0;
        this.comboSound = null; // будем инициализировать позже
        
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
        // --- Шторм ---
        this.stormOffsetX = 0;
        this.stormOffsetY = 0;
        this.stormAmplitudeX = 25;
        this.stormAmplitudeY = 12;
        // Визуализация шторма
        this.stormHistory = new Array(200).fill(0); // буфер из 200 точек
        this.stormHistoryIndex = 0;                 // указатель на текущую позицию
        this.stormGraphCanvas = document.getElementById('storm-graph');
        this.stormGraphCtx = this.stormGraphCanvas ? this.stormGraphCanvas.getContext('2d') : null;
        this.stormActive = false;

        // Таймеры
        this.gameTimer = null;
        this.crosshairMoveTimer = null;
        this.shipSpawnTimer = null;
        this.gameLoop = null;
        
        // Привязка контекста только для тех методов, которые существуют
        this.updateFieldSize = this.updateFieldSize.bind(this);
        
        this.logicalCrosshairX = this.fieldWidth / 2;
        this.logicalCrosshairY = this.fieldHeight / 2;

        this.init();
        this.initComboSound();
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

        if (this.stormGraphCtx) {
            this.redrawStormGraph(); // стартовый график (нулевая линия)
        }
    }

    initComboSound() {
        // Создаём короткий "ding"-звук с помощью Web Audio API (без внешних файлов)
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            this.comboSound = () => {
                const oscillator = context.createOscillator();
                const gain = context.createGain();

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(880, context.currentTime); // A5
                oscillator.frequency.exponentialRampToValueAtTime(1760, context.currentTime + 0.1); // вверх

                gain.gain.setValueAtTime(0.3, context.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.3);

                oscillator.connect(gain);
                gain.connect(context.destination);

                oscillator.start();
                oscillator.stop(context.currentTime + 0.3);
            };
        } catch (e) {
            console.warn('Не удалось инициализировать звук комбо:', e);
            this.comboSound = null;
        }
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
        this.logicalCrosshairX = this.fieldWidth / 2;
        this.logicalCrosshairY = this.fieldHeight / 2;
        this.crosshairLocked = false;
        this.updateCrosshairVisualPosition(); // обновляем визуал
        this.updateCrosshairState();
    }
    
    startGame() {
        if (this.gameActive) return;
        
        // Если используется COM-таймер — не запускаем локальный setInterval
        this.gameActive = true;
        this.gamePaused = false;
        this.score = 0;
        this.hits = 0;
        this.shots = 0;
        this.timeLeft = this.gameTime; // сброс времени (даже если COM — для UI)

        this.updateUI();
        this.clearShips();
        this.resetCrosshair();

        if (!this.useComTimer) {
            // Только если НЕ COM-режим
            this.gameTimer = setInterval(() => {
                if (!this.gamePaused) {
                    this.timeLeft--;
                    this.updateUI();
                    if (this.timeLeft <= 0) {
                        this.endGame();
                    }
                }
            }, 1000);
        }

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
        this.stopCrosshairAutoMove();

        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }
        if (this.shipSpawnTimer) {
            clearInterval(this.shipSpawnTimer);
            this.shipSpawnTimer = null;
        }

        this.gameStateText.textContent = 'Патруль завершён';
        this.gameStateText.style.color = '#3a5361';
        this.logMessage('Патруль завершен');
        this.showResults(); // ← вызывается
    }

    updateTimeFromCom(seconds) {
        if (!this.useComTimer || !this.gameActive) return;
        this.timeLeft = seconds;
        this.updateUI();
        if (this.timeLeft <= 0) {
            this.endGame(); // ← вызывается
        }
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
        // В COM-режиме корабли генерируются на плате — ничего не делаем
        if (this.useComTimer) {
            return;
        }
        // В keyboard-режиме — старая логика
        this.spawnShip();
        this.shipSpawnTimer = setInterval(() => {
            if (!this.gamePaused && this.gameActive) {
                if (this.ships.length < 8) {
                    this.spawnShip();
                }
            }
        }, 2000);
    }

    // Новый метод: добавление корабля от COM-устройства
    addShipFromCom(type, x, y) {
        if (!this.gameActive || this.gamePaused) return;

        let shipClass = 'small';
        if (type === 20) shipClass = 'medium';
        else if (type === 30) shipClass = 'large';
        const points = type;

        const ship = document.createElement('img');
        ship.className = `ship ${shipClass} appearing`; // Добавляем класс appearing
        ship.dataset.points = points;
        ship.src = `assets/ship-${shipClass}.png`;
        ship.alt = 'Корабль';

        // Размеры для позиционирования
        const size = shipClass === 'small' ? 50 :
                    shipClass === 'medium' ? 70 : 90;
        const halfSize = size / 2;
        const maxX = this.fieldWidth - size - 40;
        const maxY = this.fieldHeight - size - 100;
        // Ограничиваем координаты центра
        const centerX = Math.max(halfSize + 20, Math.min(this.fieldWidth - halfSize - 20, x));
        const centerY = y !== null ? Math.max(halfSize + 20, Math.min(this.fieldHeight - halfSize - 20, y)) : 
                        (halfSize + 20 + Math.random() * (this.fieldHeight - 2 * halfSize - 40));
        // Смещаем left и top, чтобы центр был в (centerX, centerY)
        const finalX = centerX - halfSize;
        const finalY = centerY - halfSize;
        ship.style.left = `${finalX}px`;
        ship.style.top = `${finalY}px`;;

        this.gameField.appendChild(ship);

        const shipData = { element: ship, points, x: finalX, y: finalY };
        this.ships.push(shipData);

        const shipName = this.getShipNameByPoints(points);
        this.logMessage(`Обнаружена ${shipName} по курсу ${Math.floor(finalX)}`);

        // Убираем класс анимации после её завершения
        setTimeout(() => {
            ship.classList.remove('appearing');
        }, 500);

        // Автоудаление с анимацией
        // setTimeout(() => {
        //     if (!this.gameActive || this.gamePaused) {
        //         return; // Не удаляем, если игра на паузе или завершена
        //     }
        //     if (ship.parentNode) {
        //         ship.classList.add('hit'); // Добавляем класс для анимации исчезновения
        //         setTimeout(() => {
        //             if (ship.parentNode && this.gameActive && !this.gamePause ) {
        //                 ship.remove();
        //             }
        //         }, 300);
        //         const index = this.ships.findIndex(s => s.element === ship);
        //         if (index !== -1) this.ships.splice(index, 1);
        //     }
        // }, 15000);
    }
    
    // Обработка промаха с координатами
    handleComMiss(x, y) {
        if (!this.gameActive || !this.useComTimer) return;
        this.shots++;
        // Преобразуем логические координаты (0–800) → пиксели
        const pixelX = Math.round(x * (this.fieldWidth / 800));
        const pixelY = Math.round(y * (this.fieldHeight / 600));
        this.createMissEffectAt(pixelX, pixelY);
        this.logMessage('Промах с COM-устройства');
        this.updateUI();
        // Снимаем фиксацию
        this.crosshairLocked = false;
        this.stopCrosshairAutoMove();
        this.updateCrosshairState();
    }

    // Обработка попадания с координатами
    handleComHit(points, shipX, shipY) {
        if (!this.gameActive || !this.useComTimer) return;
        
        this.shots++;
        this.hits++;
        this.score += points;
        
        // Найти корабль по координатам и типу
        const shipElement = this.findShipByCoords(shipX, shipY, points);
        
        if (shipElement) {
            // Получаем координаты центра корабля для эффекта
            const rect = shipElement.getBoundingClientRect();
            const fieldRect = this.gameField.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2 - fieldRect.left;
            const centerY = rect.top + rect.height / 2 - fieldRect.top;
            
            // Создаем эффект попадания в центре корабля
            this.createSplashEffectAt(centerX, centerY);
            
            // Удалить корабль
            shipElement.classList.add('hit');
            setTimeout(() => {
                if (shipElement.parentNode) {
                    shipElement.remove();
                }
            }, 800);
            
            // Удалить из массива
            const index = this.ships.findIndex(s => s.element === shipElement);
            if (index !== -1) {
                this.ships.splice(index, 1);
            }
        } else {
            // Если не нашли — создаем эффект промаха
            const pixelX = Math.round(shipX * (this.fieldWidth / 800));
            const pixelY = Math.round(shipY * (this.fieldHeight / 600));
            this.createMissEffectAt(pixelX, pixelY);
        }
        
        const shipName = this.getShipNameByPoints(points);
        const logMessage = shipElement ? 
            `Попадание с COM: потоплена ${shipName}! +${points} очков` :
            `Промах с COM по координатам (${shipX},${shipY})`;
        
        this.logMessage(logMessage);
        this.updateUI();
        this.crosshairLocked = false;
        this.stopCrosshairAutoMove();
        this.updateCrosshairState();
    }

    findShipByCoords(x, y, points) {
        // Преобразуем логические координаты STM32 (0-800, 0-600) в пиксели на экране
        const pixelX = Math.round(x * (this.fieldWidth / 800));
        const pixelY = Math.round(y * (this.fieldHeight / 600));
        
        // Находим корабль, который ближе всего к этим координатам
        let closestShip = null;
        let minDistance = Infinity;
        
        for (const ship of this.ships) {
            const rect = ship.element.getBoundingClientRect();
            const fieldRect = this.gameField.getBoundingClientRect();
            
            // Вычисляем центр корабля в координатах относительно игрового поля
            const shipCenterX = rect.left + rect.width / 2 - fieldRect.left;
            const shipCenterY = rect.top + rect.height / 2 - fieldRect.top;
            
            // Вычисляем расстояние
            const distance = Math.sqrt(
                Math.pow(shipCenterX - pixelX, 2) + 
                Math.pow(shipCenterY - pixelY, 2)
            );
            
            // Проверяем, совпадают ли очки и расстояние достаточно мало
            const radius = ship.points === 10 ? 25 : 
                        ship.points === 20 ? 35 : 45;
            
            if (ship.points === points && distance <= radius && distance < minDistance) {
                minDistance = distance;
                closestShip = ship.element;
            }
        }
        
        return closestShip;
    }

    createMissEffectAt(x, y) {
        const ripple = document.createElement('div');
        ripple.className = 'splash';
        ripple.style.background = 'radial-gradient(circle, white 0%, rgba(130, 185, 191, 0.7) 100%)';
        ripple.style.left = `${x - 20}px`;
        ripple.style.top = `${y - 20}px`;
        this.gameField.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    createSplashEffectAt(x, y) {
        const splash = document.createElement('div');
        splash.className = 'splash';
        splash.style.left = `${x - 20}px`;
        splash.style.top = `${y - 20}px`;
        this.gameField.appendChild(splash);
        setTimeout(() => splash.remove(), 600);
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
            const newLeft = this.logicalCrosshairX + (moveDirection * this.crosshairSpeed);
            const minX = 40;
            const maxX = this.fieldWidth - 40;
            if (newLeft >= minX && newLeft <= maxX) {
                this.logicalCrosshairX = newLeft;
            }
            this.updateCrosshairVisualPosition(); // обновляем визуал
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
    
    startStorm() {
        this.stormActive = true;
        this.stormHistory.fill(0);
        this.stormHistoryIndex = 0;
        this.logMessage('Шторм начался!');
        this.redrawStormGraph();
    }

    endStorm() {
        this.stormActive = false;
        this.stormOffsetX = 0;
        this.stormOffsetY = 0;
        this.stormHistory.fill(0);
        this.stormHistoryIndex = 0;
        this.updateCrosshairVisualPosition();
        this.redrawStormGraph();
        this.logMessage('Шторм прекратился.');
    }

    setStormOffset(x, y) {
        //if (!this.stormActive) return; // ← ключевая строка!
        this.stormOffsetX = x || 0;
        this.stormOffsetY = y || 0;
        if (this.stormHistory) {
            this.stormHistory[this.stormHistoryIndex] = this.stormOffsetX;
            this.stormHistoryIndex = (this.stormHistoryIndex + 1) % this.stormHistory.length;
        }
        this.updateCrosshairVisualPosition();
        this.redrawStormGraph();
    }

    redrawStormGraph() {
        if (!this.stormGraphCtx || !this.stormGraphCanvas) return;

        const ctx = this.stormGraphCtx;
        const canvas = this.stormGraphCanvas;
        const width = canvas.width;
        const height = canvas.height;

        // Очистка
        ctx.clearRect(0, 0, width, height);

        // Параметры
        const maxAmplitude = 50;
        const centerY = height / 2;
        const pixelsPerUnit = (height / 2) / maxAmplitude; // сколько пикселей на 1 единицу

        // === Горизонтальные линии уровней (без подписей) ===
        ctx.strokeStyle = 'rgba(130, 185, 191, 0.15)';
        ctx.lineWidth = 1;
        const step = 10;
        for (let val = -maxAmplitude; val <= maxAmplitude; val += step) {
            if (val === 0) continue; // ноль — отдельно
            const y = centerY - val * pixelsPerUnit;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Центральная линия (ноль)
        ctx.strokeStyle = 'rgba(130, 185, 191, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        // === Сплошной график (реальные данные из stormHistory) ===
        if (this.stormHistory && this.stormHistory.length > 0) {
            ctx.strokeStyle = '#82b9bf';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();

            const historyLength = this.stormHistory.length;
            const startIndex = (this.stormHistoryIndex - historyLength + historyLength) % historyLength;

            for (let i = 0; i < historyLength; i++) {
                const dataIndex = (startIndex + i) % historyLength;
                const value = this.stormHistory[dataIndex];
                const x = (i / (historyLength - 1)) * width;
                const y = centerY - value * pixelsPerUnit;

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // === Обновляем только внешнюю подпись под графиком (без "Амплитуда:") ===
        const ampDisplay = document.getElementById('storm-amplitude');
        if (ampDisplay) {
            ampDisplay.textContent = `${this.stormAmplitudeX || 25} пикс.`;
        }
    }

    updateCrosshairVisualPosition() {
        const visualX = this.logicalCrosshairX + this.stormOffsetX;
        const visualY = this.logicalCrosshairY + this.stormOffsetY;
        this.crosshair.style.left = `${visualX}px`;
        this.crosshair.style.top = `${visualY}px`;
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
            let newTop = this.logicalCrosshairY + (this.crosshairVerticalDirection * this.crosshairVerticalSpeed);
            const minY = 40;
            const maxY = this.fieldHeight - 40;
            if (newTop <= minY) {
                newTop = minY;
                this.crosshairVerticalDirection = 1;
            } else if (newTop >= maxY) {
                newTop = maxY;
                this.crosshairVerticalDirection = -1;
            }
            this.logicalCrosshairY = newTop;
            this.updateCrosshairVisualPosition();
            
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

    stepCrosshair(direction) {
        if (!this.gameActive || this.gamePaused || this.crosshairLocked) return;
        const step = 25;
        const newLeft = this.logicalCrosshairX + (direction * step);
        const minX = 40;
        const maxX = this.fieldWidth - 40;
        if (newLeft >= minX && newLeft <= maxX) {
            this.logicalCrosshairX = newLeft;
            this.updateCrosshairVisualPosition();
        }
    }
    
    fire() {
        if (!this.gameActive || this.gamePaused || !this.crosshairLocked) return;
        this.shots++;
        const hit = this.checkHit();
        if (hit) {
            this.logMessage('Попадание!');
        } else {
            this.createMissEffect();
            this.logMessage('Промах!');
            this.comboCount = 0; 
        }
        this.crosshairLocked = false;
        this.stopCrosshairAutoMove();
        this.updateCrosshairState();
        this.updateUI();
    }
    
    triggerCombo() {
        this.comboCount = 0; // сбрасываем после триггера
        if (this.comboSound) {
            this.comboSound();
        }
        this.logMessage('🔥 Комбо! 5 попаданий подряд!');
        // Опционально: визуальный эффект или анимация
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
        this.comboCount++;
        if (this.comboCount >= 5) {
            this.triggerCombo();
        }
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
            'Ошибка',
        ];

        const isSystemMessage = systemKeywords.some(keyword => message.includes(keyword) && !message.includes("TIME") && !message.includes("STORM:") && !message.includes("SHIP:"));

        if (isSystemMessage) {
            console.log(`[Журнал] ${message}`);
        }
        
        // Ограничиваем количество записей
        const entries = logContent.querySelectorAll('.log-entry');
        if (entries.length > 100) {
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