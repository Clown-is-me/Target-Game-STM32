// Главный файл, инициализирующий приложение
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚢 Морская Охотничья Застава загружается...');
    
    // Создаем экземпляр игры
    const game = new ShipGame();
    
    // Создаем генератор медуз
    const medusaGenerator = new MedusaGenerator();
    
    // Создаем UI
    const ui = new GameUI(game);
    
    // Настраиваем обработку ввода (клавиатура)
    const inputHandler = new InputHandler(game);
    
    // Экспортируем объекты в глобальную область видимости для отладки
    window.game = game;
    window.ui = ui;
    window.inputHandler = inputHandler;
    window.medusaGenerator = medusaGenerator;
    
    // Проверяем доступность Web Serial API
    checkWebSerialSupport();
    
    console.log('Игра загружена. Управление:');
    console.log('Режим клавиатуры: A/D - движение, SPACE - фиксация/выстрел, ESC - пауза');
    console.log('Режим COM-устройства: Кнопки на плате STM32');
});

// Проверка поддержки Web Serial API
function checkWebSerialSupport() {
    if (!('serial' in navigator)) {
        console.warn('Web Serial API не поддерживается этим браузером.');
        console.warn('Для работы с COM-устройством используйте Chrome, Edge или Opera 89+');
        
        // Показываем предупреждение в UI
        setTimeout(() => {
            const comStatus = document.getElementById('com-status');
            if (comStatus) {
                comStatus.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    Web Serial API не поддерживается<br>
                    <small>Используйте Chrome, Edge или Opera 89+ для работы с COM-устройством</small>
                `;
                comStatus.style.background = 'rgba(255, 193, 7, 0.2)';
                comStatus.style.borderColor = 'rgba(255, 193, 7, 0.3)';
                comStatus.style.color = '#ffc107';
            }
        }, 1000);
    } else {
        console.log('Web Serial API поддерживается.');
    }
}

// Глобальные хоткеи для отладки
document.addEventListener('keydown', (event) => {
    // Ctrl+Shift+D для отладки
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
        event.preventDefault();
        console.log('=== DEBUG INFO ===');
        console.log('Game:', window.game);
        console.log('UI:', window.ui);
        console.log('Input Handler:', window.inputHandler);
        console.log('COM Interface:', window.ui?.comInterface);
        console.log('==================');
    }
    
    // Ctrl+Shift+C для тестового COM подключения
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        event.preventDefault();
        if (window.ui?.comInterface) {
            if (!window.ui.comInterface.connected) {
                window.ui.comInterface.mockConnect();
                console.log('Тестовое COM-устройство подключено');
            } else {
                window.ui.comInterface.mockDisconnect();
                console.log('Тестовое COM-устройство отключено');
            }
        }
    }
});