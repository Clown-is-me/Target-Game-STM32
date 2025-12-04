document.addEventListener('DOMContentLoaded', () => {
    console.log('Акварельная морская игра загружается...');
    
    // Создаем экземпляр игры
    const game = new ShipGame();
    
    // Создаем генератор медуз вместо пузырей
    const medusaGenerator = new MedusaGenerator();
    
    // Инициализируем волны
    const waveManager = new WaveManager();
    
    // Создаем UI
    const ui = new GameUI(game);
    
    // Настраиваем обработку ввода
    const inputHandler = new InputHandler(game);
    
    // Настройка переключения режимов
    const keyboardModeBtn = document.getElementById('keyboard-mode');
    const comModeBtn = document.getElementById('com-mode');
    
    keyboardModeBtn.addEventListener('click', () => {
        keyboardModeBtn.classList.add('active');
        comModeBtn.classList.remove('active');
        game.logMessage('Режим управления: Клавиатура');
    });
    
    comModeBtn.addEventListener('click', () => {
        if (!comModeBtn.classList.contains('disabled')) {
            keyboardModeBtn.classList.remove('active');
            comModeBtn.classList.add('active');
            game.logMessage('Режим управления: COM-устройство');
        }
    });
    
    // Очистка лога
    document.querySelector('.log-clear').addEventListener('click', () => {
        const logContent = document.querySelector('.log-content');
        logContent.innerHTML = '';
        game.logMessage('Журнал очищен');
    });
    
    // Экспорт для отладки
    window.game = game;
    window.ui = ui;
    window.medusaGenerator = medusaGenerator;
    window.inputHandler = inputHandler;
    
    console.log('Игра загружена. Управление: A/D - движение, SPACE - фиксация/выстрел, ESC - пауза');
});