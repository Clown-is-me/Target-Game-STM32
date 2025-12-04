// Класс для управления вводом с клавиатуры - ПЕРЕПИСАННЫЙ
class InputHandler {
    constructor(game) {
        this.game = game;
        this.keysPressed = new Set();
        this.moveDirection = 0;
        
        this.init();
    }
    
    init() {
        // Обработчики событий клавиатуры
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
        document.addEventListener('keyup', (event) => this.handleKeyUp(event));
        
        // Предотвращаем стандартное поведение для игровых клавиш
        document.addEventListener('keydown', (event) => {
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
                if (this.moveDirection !== 0) {
                    // Двигаем прицел
                    const step = 8; // Скорость движения при зажатой клавише
                    const currentLeft = parseInt(this.game.crosshair.style.left) || this.game.fieldWidth / 2;
                    const newLeft = currentLeft + (this.moveDirection * step);
                    
                    // Ограничиваем движение в пределах поля
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
    
    handleKeyDown(event) {
        if (event.repeat && ['KeyA', 'KeyD'].includes(event.code)) {
            return;
        }
        
        this.keysPressed.add(event.code);
        
        switch(event.code) {
            case 'KeyA':
                this.moveDirection = -1;
                break;
            case 'KeyD':
                this.moveDirection = 1;
                break;
            case 'Space':
                event.preventDefault();
                if (!this.game.crosshairLocked) {
                    this.game.lockCrosshair();
                } else {
                    this.game.fire();
                }
                break;
            case 'Escape':
                this.game.pauseGame();
                break;
        }
    }
    
    handleKeyUp(event) {
        this.keysPressed.delete(event.code);
        
        switch(event.code) {
            case 'KeyA':
                if (this.keysPressed.has('KeyD')) {
                    this.moveDirection = 1;
                } else {
                    this.moveDirection = 0;
                }
                break;
            case 'KeyD':
                if (this.keysPressed.has('KeyA')) {
                    this.moveDirection = -1;
                } else {
                    this.moveDirection = 0;
                }
                break;
        }
    }
}