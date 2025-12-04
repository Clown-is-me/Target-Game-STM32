// Генератор медуз с теплой цветовой палитрой
class MedusaGenerator {
    constructor() {
        this.container = document.getElementById('bubbles-container');
        this.medusas = [];
        this.clusters = [];
        this.maxMedusas = 12;
        this.maxClusters = 4;
        
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
        
        // Случайная начальная позиция
        const startX = Math.random() * 100;
        const startY = 100 + Math.random() * 50;
        
        // Случайные свойства анимации
        const duration = 25 + Math.random() * 20;
        const sway = Math.random() * 30 - 15;
        const floatSpeed = 0.3 + Math.random() * 0.7;
        
        // Применяем стили
        medusa.style.left = `${startX}vw`;
        medusa.style.top = `${startY}vh`;
        medusa.style.opacity = 0.5 + Math.random() * 0.3;
        
        // Случайный теплый оттенок (персиковый, абрикосовый, песочный)
        const hue = 25 + Math.random() * 15; // 25-40 (оранжево-персиковый)
        const saturation = 30 + Math.random() * 20; // 30-50%
        const lightness = 75 + Math.random() * 10; // 75-85%
        
        // Обновляем цвета купола
        medusa.style.setProperty('--medusa-color-1', `hsla(${hue}, ${saturation}%, ${lightness}%, 0.7)`);
        medusa.style.setProperty('--medusa-color-2', `hsla(${hue + 5}, ${saturation + 10}%, ${lightness - 10}%, 0.4)`);
        medusa.style.setProperty('--medusa-color-3', `hsla(${hue + 10}, ${saturation + 5}%, ${lightness - 15}%, 0.1)`);
        
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
            rotationSpeed: (Math.random() - 0.5) * 0.5,
            pulsePhase: Math.random() * Math.PI * 2
        });
    }
    
    createCluster() {
        const cluster = document.createElement('div');
        cluster.className = 'medusa-cluster';
        
        // Создаем несколько маленьких медуз в кластере
        for (let i = 0; i < 3; i++) {
            const smallMedusa = document.createElement('div');
            smallMedusa.className = 'medusa medusa-small';
            
            // Добавляем свечение
            const glow = document.createElement('div');
            glow.className = 'medusa-glow';
            smallMedusa.appendChild(glow);
            
            cluster.appendChild(smallMedusa);
        }
        
        // Случайная позиция кластера
        const startX = Math.random() * 100;
        const startY = 100 + Math.random() * 30;
        
        cluster.style.left = `${startX}vw`;
        cluster.style.top = `${startY}vh`;
        cluster.style.opacity = 0.4 + Math.random() * 0.2;
        
        this.container.appendChild(cluster);
        
        this.clusters.push({
            element: cluster,
            startX: startX,
            startY: startY,
            floatSpeed: 0.2 + Math.random() * 0.5,
            sway: Math.random() * 15 - 7.5,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 0.3
        });
    }
    
    animate() {
        const animateFrame = () => {
            const time = Date.now() / 1000;
            
            // Анимация отдельных медуз
            this.medusas.forEach((medusa, index) => {
                if (!medusa.element.parentNode) {
                    this.medusas.splice(index, 1);
                    this.createMedusa();
                    return;
                }
                
                // Рассчитываем прогресс
                const progress = (time % medusa.duration) / medusa.duration;
                const currentY = medusa.startY - progress * 100;
                
                if (currentY < -10) {
                    // Медуза вышла за верх экрана - пересоздаем
                    medusa.element.remove();
                    this.medusas.splice(index, 1);
                    this.createMedusa();
                    return;
                }
                
                // Легкое горизонтальное покачивание
                const swayOffset = Math.sin(time * medusa.floatSpeed + medusa.startX) * medusa.sway;
                const currentX = medusa.startX + swayOffset;
                
                // Вращение
                medusa.rotation += medusa.rotationSpeed;
                
                // Пульсация
                medusa.pulsePhase += 0.02;
                const pulseScale = 0.9 + Math.sin(medusa.pulsePhase) * 0.1;
                
                // Применяем позицию и трансформации
                medusa.element.style.top = `${currentY}vh`;
                medusa.element.style.left = `${currentX}vw`;
                medusa.element.style.transform = `rotate(${medusa.rotation}deg) scale(${pulseScale})`;
                
                // Легкое изменение прозрачности
                const opacity = 0.4 + Math.sin(time * 0.5) * 0.2;
                medusa.element.style.opacity = opacity;
            });
            
            // Анимация кластеров
            this.clusters.forEach((cluster, index) => {
                if (!cluster.element.parentNode) {
                    this.clusters.splice(index, 1);
                    this.createCluster();
                    return;
                }
                
                const progress = (time % 40) / 40;
                const currentY = cluster.startY - progress * 60;
                
                if (currentY < -20) {
                    cluster.element.remove();
                    this.clusters.splice(index, 1);
                    this.createCluster();
                    return;
                }
                
                const swayOffset = Math.sin(time * 0.3 + cluster.startX) * cluster.sway;
                const currentX = cluster.startX + swayOffset;
                
                cluster.rotation += cluster.rotationSpeed;
                
                cluster.element.style.top = `${currentY}vh`;
                cluster.element.style.left = `${currentX}vw`;
                cluster.element.style.transform = `rotate(${cluster.rotation}deg)`;
                cluster.element.style.opacity = 0.3 + Math.sin(time * 0.4) * 0.1;
            });
            
            requestAnimationFrame(animateFrame);
        };
        
        animateFrame();
    }
}