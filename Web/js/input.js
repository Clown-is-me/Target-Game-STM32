class InputHandler {
    constructor(game) {
        this.game = game;
        this.keysPressed = new Set();
        this.moveDirection = 0;
        this.enabled = true;
        
        // Связываем методы
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        
        this.init();
    }
    
    init() {
        // Добавляем обработчики клавиатуры
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        
        // Предотвращаем стандартное поведение для игровых клавиш
        document.addEventListener('keydown', (event) => {
            if (!this.enabled) return;
            if (['Space', 'KeyA', 'KeyD', 'Escape'].includes(event.code)) {
                event.preventDefault();
            }
        }, false);
        
        // Запускаем игровой цикл для плавного движения
        this.startGameLoop();
    }
    
    startGameLoop() {
        const gameLoop = () => {
            if (this.game.gameActive && !this.game.gamePaused && !this.game.crosshairLocked) {
                // Обновляем позицию прицела на основе текущего направления
                if (this.moveDirection !== 0) {
                    const step = 8;
                    const currentLeft = parseInt(this.game.crosshair.style.left) || this.game.fieldWidth / 2;
                    const newLeft = currentLeft + (this.moveDirection * step);
                    
                    const minX = 40;
                    const maxX = this.game.fieldWidth - 40;
                    
                    if (newLeft >= minX && newLeft <= maxX) {
                        this.game.crosshair.style.left = `${newLeft}px`;
                    }
                }
            }
            requestAnimationFrame(gameLoop);
        };
        gameLoop();
    }
    
    enable() {
        this.enabled = true;
        console.log('InputHandler: включен');
    }
    
    disable() {
        this.enabled = false;
        // Сбрасываем все состояния
        this.moveDirection = 0;
        this.keysPressed.clear();
        
        // Также сбрасываем состояния в игре
        this.game.moveLeft = false;
        this.game.moveRight = false;
        
        console.log('InputHandler: отключен');
    }
    
    handleKeyDown(event) {
        if (!this.enabled) return;
        
        // Игнорируем повторные нажатия
        if (event.repeat) return;
        
        this.keysPressed.add(event.code);
        
        switch(event.code) {
            case 'KeyA':
                this.moveDirection = -1;
                this.game.moveLeft = true;
                this.game.moveRight = false;
                break;
            case 'KeyD':
                this.moveDirection = 1;
                this.game.moveRight = true;
                this.game.moveLeft = false;
                break;
            case 'Space':
                event.preventDefault();
                if (!this.game.gameActive) return;
                if (this.game.gamePaused) return;
                
                if (!this.game.crosshairLocked) {
                    this.game.lockCrosshair();
                } else {
                    this.game.fire();
                }
                break;
            case 'Escape':
                if (this.game.gameActive) {
                    this.game.pauseGame();
                }
                break;
        }
    }
    
    handleKeyUp(event) {
        if (!this.enabled) return;
        
        this.keysPressed.delete(event.code);
        
        switch(event.code) {
            case 'KeyA':
                if (this.keysPressed.has('KeyD')) {
                    this.moveDirection = 1;
                    this.game.moveRight = true;
                    this.game.moveLeft = false;
                } else {
                    this.moveDirection = 0;
                    this.game.moveLeft = false;
                }
                break;
            case 'KeyD':
                if (this.keysPressed.has('KeyA')) {
                    this.moveDirection = -1;
                    this.game.moveLeft = true;
                    this.game.moveRight = false;
                } else {
                    this.moveDirection = 0;
                    this.game.moveRight = false;
                }
                break;
        }
    }
}