// ===== УЛУЧШЕННЫЙ ГЕНЕРАТОР МЕДУЗ С АКЦЕНТОМ НА БОКОВЫЕ ОБЛАСТИ =====
class MedusaGenerator {
    constructor() {
        this.container = document.getElementById('bubbles-container');
        this.medusas = [];
        this.clusters = [];
        this.maxMedusas = 25; // Больше медуз
        this.maxClusters = 8; // Больше кластеров
        this.animationFrameId = null;
        
        this.init();
    }
    
    init() {
        this.createMedusas();
        this.createClusters();
        this.animate();
    }
    
    createMedusas() {
        for (let i = 0; i < this.maxMedusas; i++) {
            this.createMedusa();
        }
    }
    
    createClusters() {
        for (let i = 0; i < this.maxClusters; i++) {
            this.createCluster();
        }
    }
    
    createMedusa() {
        const medusa = document.createElement('div');
        medusa.className = 'medusa';
        
        // Случайный размер
        const sizes = ['medusa-small', 'medusa-medium', 'medusa-large'];
        const sizeClass = sizes[Math.floor(Math.random() * sizes.length)];
        medusa.classList.add(sizeClass);
        
        // Добавляем свечение
        const glow = document.createElement('div');
        glow.className = 'medusa-glow';
        medusa.appendChild(glow);
        
        // Добавляем внутренний слой для объема
        const inner = document.createElement('div');
        inner.className = 'medusa-inner';
        medusa.appendChild(inner);
        
        // Распределение: 70% медуз по бокам, 30% в центре
        let startX;
        const sideBias = Math.random();
        
        if (sideBias < 0.35) {
            // Левая боковая область (0-20%)
            startX = Math.random() * 20;
        } else if (sideBias < 0.7) {
            // Правая боковая область (80-100%)
            startX = 80 + Math.random() * 20;
        } else {
            // Центральная область (20-80%)
            startX = 20 + Math.random() * 60;
        }
        
        const startY = 100 + Math.random() * 20; // Начинаем чуть ниже экрана
        
        // Случайные свойства анимации
        const duration = 35 + Math.random() * 25;
        const sway = (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 25); // Боковые сильнее качаются
        const floatSpeed = 0.15 + Math.random() * 0.25;
        
        // Применяем стили
        medusa.style.left = `${startX}vw`;
        medusa.style.top = `${startY}vh`;
        medusa.style.opacity = 0.4 + Math.random() * 0.3;
        
        // Теплые персиковые тона с вариациями
        const hue = 25 + Math.random() * 15;
        const saturation = 30 + Math.random() * 25;
        const lightness = 75 + Math.random() * 15;
        
        // Более приятная цветовая палитра
        medusa.style.setProperty('--medusa-color-1', `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`);
        medusa.style.setProperty('--medusa-color-2', `hsla(${hue + 5}, ${saturation + 5}%, ${lightness - 5}%, 0.3)`);
        medusa.style.setProperty('--medusa-color-3', `hsla(${hue + 10}, ${saturation + 10}%, ${lightness - 10}%, 0.1)`);
        medusa.style.setProperty('--medusa-tentacle-color', `hsla(${hue}, ${saturation - 10}%, ${lightness - 15}%, 0.4)`);
        
        this.container.appendChild(medusa);
        
        // Сохраняем информацию о медузе
        this.medusas.push({
            element: medusa,
            startX: startX,
            startY: startY,
            sway: sway,
            duration: duration,
            floatSpeed: floatSpeed,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 0.25,
            pulsePhase: Math.random() * Math.PI * 2,
            startTime: Date.now(),
            verticalOffset: Math.random() * 20
        });
    }
    
    createCluster() {
        const cluster = document.createElement('div');
        cluster.className = 'medusa-cluster';
        
        // Кластеры создаем только по бокам
        let startX;
        if (Math.random() > 0.5) {
            // Левая сторона (0-15%)
            startX = Math.random() * 15;
        } else {
            // Правая сторона (85-100%)
            startX = 85 + Math.random() * 15;
        }
        
        const startY = 100 + Math.random() * 30;
        
        // Создаем 3 медузы в кластере
        for (let i = 0; i < 3; i++) {
            const smallMedusa = document.createElement('div');
            smallMedusa.className = 'medusa medusa-small';
            
            // Добавляем свечение
            const glow = document.createElement('div');
            glow.className = 'medusa-glow';
            smallMedusa.appendChild(glow);
            
            // Добавляем внутренний слой
            const inner = document.createElement('div');
            inner.className = 'medusa-inner';
            smallMedusa.appendChild(inner);
            
            cluster.appendChild(smallMedusa);
        }
        
        cluster.style.left = `${startX}vw`;
        cluster.style.top = `${startY}vh`;
        cluster.style.opacity = 0.5 + Math.random() * 0.2;
        
        this.container.appendChild(cluster);
        
        this.clusters.push({
            element: cluster,
            startX: startX,
            startY: startY,
            floatSpeed: 0.1 + Math.random() * 0.2,
            sway: (startX < 50 ? 1 : -1) * (15 + Math.random() * 20), // Кластеры качаются в сторону от центра
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 0.15,
            startTime: Date.now()
        });
    }
    
    animate() {
        const animateFrame = () => {
            const currentTime = Date.now();
            
            // Анимация отдельных медуз
            this.medusas.forEach((medusa, index) => {
                if (!medusa.element.parentNode) {
                    this.medusas.splice(index, 1);
                    this.createMedusa();
                    return;
                }
                
                // Рассчитываем прогресс
                const elapsed = (currentTime - medusa.startTime) / 1000;
                const progress = (elapsed % medusa.duration) / medusa.duration;
                
                // Плавное движение вверх
                const currentY = medusa.startY - progress * 120;
                
                if (currentY < -20) {
                    // Медуза вышла за верх экрана - пересоздаем
                    medusa.element.remove();
                    this.medusas.splice(index, 1);
                    this.createMedusa();
                    return;
                }
                
                // Горизонтальное покачивание с учетом бокового положения
                const swayFactor = Math.abs(medusa.startX - 50) / 50; // 0 в центре, 1 по краям
                const swayIntensity = swayFactor * 2; // Боковые медузы качаются сильнее
                
                const swayOffset = Math.sin(elapsed * medusa.floatSpeed + medusa.startX * 0.02) 
                    * medusa.sway * swayIntensity;
                
                let currentX = medusa.startX + swayOffset;
                
                // Удерживаем медузы в пределах экрана
                currentX = Math.max(-10, Math.min(110, currentX));
                
                // Вращение
                medusa.rotation += medusa.rotationSpeed;
                
                // Плавная пульсация
                medusa.pulsePhase += 0.01;
                const pulseScale = 0.95 + Math.sin(medusa.pulsePhase) * 0.05;
                
                // Плавное изменение прозрачности
                const opacity = 0.3 + Math.sin(elapsed * 0.2 + medusa.startX) * 0.15;
                
                // Легкое вертикальное покачивание
                const floatOffset = Math.sin(elapsed * 0.3) * medusa.verticalOffset;
                
                // Применяем трансформации
                medusa.element.style.top = `${currentY + floatOffset}vh`;
                medusa.element.style.left = `${currentX}vw`;
                medusa.element.style.transform = `rotate(${medusa.rotation}deg) scale(${pulseScale})`;
                medusa.element.style.opacity = opacity;
            });
            
            // Анимация кластеров (только по бокам)
            this.clusters.forEach((cluster, index) => {
                if (!cluster.element.parentNode) {
                    this.clusters.splice(index, 1);
                    this.createCluster();
                    return;
                }
                
                const elapsed = (currentTime - cluster.startTime) / 1000;
                const progress = (elapsed % 60) / 60;
                const currentY = cluster.startY - progress * 100;
                
                if (currentY < -30) {
                    cluster.element.remove();
                    this.clusters.splice(index, 1);
                    this.createCluster();
                    return;
                }
                
                // Кластеры движутся с легким смещением от центра
                const swayOffset = Math.sin(elapsed * 0.2) * cluster.sway;
                let currentX = cluster.startX + swayOffset;
                
                // Удерживаем кластеры в боковых областях
                if (cluster.startX < 50) {
                    currentX = Math.max(-5, Math.min(20, currentX));
                } else {
                    currentX = Math.max(80, Math.min(105, currentX));
                }
                
                cluster.rotation += cluster.rotationSpeed;
                
                const opacity = 0.4 + Math.sin(elapsed * 0.15) * 0.1;
                
                cluster.element.style.top = `${currentY}vh`;
                cluster.element.style.left = `${currentX}vw`;
                cluster.element.style.transform = `rotate(${cluster.rotation}deg)`;
                cluster.element.style.opacity = opacity;
            });
            
            this.animationFrameId = requestAnimationFrame(animateFrame);
        };
        
        animateFrame();
    }
    
    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        this.medusas.forEach(medusa => medusa.element.remove());
        this.clusters.forEach(cluster => cluster.element.remove());
        
        this.medusas = [];
        this.clusters = [];
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    const medusaGenerator = new MedusaGenerator();
    
    // Остановка анимации при скрытии вкладки для оптимизации
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            medusaGenerator.destroy();
        } else {
            medusaGenerator.init();
        }
    });
});