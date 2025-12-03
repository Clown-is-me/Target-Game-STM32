// Класс для управления вводом с клавиатуры
class InputHandler {
    constructor(game) {
        this.game = game;
        this.keys = new Set();
        
        this.init();
    }
    
    init() {
        // Обработчики событий клавиатуры
        document.addEventListener('keydown', (event) => {
            this.keys.add(event.code);
            this.game.handleKeyDown(event);
        });
        
        document.addEventListener('keyup', (event) => {
            this.keys.delete(event.code);
        });
        
        // Предотвращаем стандартное поведение для игровых клавиш
        document.addEventListener('keydown', (event) => {
            if (['Space', 'KeyA', 'KeyD', 'Escape'].includes(event.code)) {
                event.preventDefault();
            }
        }, false);
    }
    
    isKeyPressed(keyCode) {
        return this.keys.has(keyCode);
    }
}