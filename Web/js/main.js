document.addEventListener('DOMContentLoaded', () => {
    console.log('Акварельная морская игра загружается...');
    
    // Создаем экземпляр игры
    const game = new ShipGame();
    
    // Создаем генератор медуз
    const medusaGenerator = new MedusaGenerator();
        
    // Создаем UI
    const ui = new GameUI(game);
    game.comInterface = ui.comInterface;
    // Настраиваем обработку ввода
    const inputHandler = new InputHandler(game);
    game.inputHandler = inputHandler; // Сохраняем ссылку в игре
    
    // Настройка переключения режимов
    const keyboardModeBtn = document.getElementById('keyboard-mode');
    const comModeBtn = document.getElementById('com-mode');
    
    keyboardModeBtn.addEventListener('click', () => {
        ui.setControlMode('keyboard');
    });
    
    comModeBtn.addEventListener('click', () => {
        if (ui.comInterface && ui.comInterface.connected) {
            ui.setControlMode('com');
        } else {
            game.logMessage('COM-устройство не подключено. Подключите устройство сначала.');
        }
    });
    
    /// --- УПРАВЛЕНИЕ АМПЛИТУДОЙ ШТОРМА (НОВАЯ ЛОГИКА) ---
    document.querySelector('.storm-btn-inc')?.addEventListener('click', () => {
        if (!ui.comInterface?.connected) {
            game.logMessage('COM не подключён — изменение амплитуды недоступно');
            return;
        }
        const axis = document.querySelector('input[name="storm-axis"]:checked')?.value || 'x';
        let dx = 0, dy = 0;
        if (axis === 'x') dx = 1;
        else dy = 1;
        ui.comInterface.sendCommand(`STORM_UPDATE:${dx},${dy}`);
    });

    document.querySelector('.storm-btn-dec')?.addEventListener('click', () => {
        if (!ui.comInterface?.connected) {
            game.logMessage('COM не подключён — изменение амплитуды недоступно');
            return;
        }
        const axis = document.querySelector('input[name="storm-axis"]:checked')?.value || 'x';
        let dx = 0, dy = 0;
        if (axis === 'x') dx = -1;
        else dy = -1;
        ui.comInterface.sendCommand(`STORM_UPDATE:${dx},${dy}`);
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