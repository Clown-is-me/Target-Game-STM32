/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2024 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "tim.h"
#include "usart.h"
#include "gpio.h"
#include "math.h"
#include "string.h"
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

//  
typedef enum {
    SHIP_SMALL = 0,    // 10 ?
    SHIP_MEDIUM = 1,   // 20 ?
    SHIP_LARGE = 2     // 30 ?
} ShipType;

// ? ?
typedef struct {
    uint8_t x;         // ? X (0-100%)
    uint8_t y;         // ? Y (0-100%)
    ShipType type;     // ? ?
    uint8_t active;    // ?  ?
} Ship;

// ? ?
typedef struct {
    uint8_t x;         // ? X (0-100%)
    uint8_t y;         // ? Y (0-100%)
    uint8_t locked;    //   
    uint8_t direction; // ?   Y (0: ?, 1: )
} Crosshair;

// ? ?
typedef enum {
    GAME_IDLE = 0,
    GAME_ACTIVE,
    GAME_PAUSED,
    GAME_ENDED
} GameState;

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

#define PI 3.14159f
#define DEBOUNCE_DELAY 50
#define MAX_SHIPS 8
#define GAME_TIME 60      // 60   
#define FIELD_WIDTH 100   //   ? ?
#define FIELD_HEIGHT 100  //   ? ?
#define HIT_RADIUS 5      //  ? ? ?

// 
#define SHIP_SMALL_WIDTH 6
#define SHIP_MEDIUM_WIDTH 8
#define SHIP_LARGE_WIDTH 10
#define SHIP_SMALL_HEIGHT 3
#define SHIP_MEDIUM_HEIGHT 4
#define SHIP_LARGE_HEIGHT 5

//   
#define SCORE_SMALL 10
#define SCORE_MEDIUM 20
#define SCORE_LARGE 30

// 
#define SPAWN_CHANCE_SMALL 50   // 50%
#define SPAWN_CHANCE_MEDIUM 30  // 30%
#define SPAWN_CHANCE_LARGE 20   // 20%

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */
//  
uint32_t left_button_last_time = 0;
uint32_t middle_button_last_time = 0;
uint32_t right_button_last_time = 0;

//  ? ?
uint8_t disp_buf[4] = {0xFF, 0xFF, 0xFF, 0xFF};
uint8_t seg_nums[4] = {0xF8, 0xF4, 0xF2, 0xF1};
uint8_t seg_digits[10] = {0xC0, 0xF9, 0xA4, 0xB0, 0x99, 
                          0x92, 0x82, 0xF8, 0x80, 0x90};
uint8_t seg_minus = 0x40;   
uint8_t seg_dot = 0x80;

// ? 
volatile uint32_t game_timer = GAME_TIME;
volatile uint32_t game_start_time = 0;
volatile uint32_t last_spawn_time = 0;
volatile uint32_t last_move_time = 0;
volatile uint32_t last_vertical_move_time = 0;
volatile uint32_t last_button_press_time = 0;

volatile GameState game_state = GAME_IDLE;
volatile uint32_t score = 0;
volatile uint32_t hits = 0;
volatile uint32_t shots = 0;
volatile uint8_t accuracy = 0;

volatile uint8_t continuous_left = 0;
volatile uint8_t continuous_right = 0;
volatile uint8_t move_speed = 2;  

//  
Ship ships[MAX_SHIPS];
Crosshair crosshair;

// 
char log_buffer[128];
volatile uint8_t logging_enabled = 1;

// 
volatile uint32_t random_seed = 0;

/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
/* USER CODE BEGIN PFP */

// 
void log_message(const char* format, ...);
void log_game_event(const char* event, uint32_t data);
void writeByteToDisplay(uint8_t z);
void writeSegmentToDisplay(uint8_t z, uint8_t val);
void displayFloatNumber(float number);
uint32_t get_random(uint32_t min, uint32_t max);
void init_game(void);
void spawn_ship(void);
void update_crosshair(void);
void check_hits(void);
void fire(void);
void process_button_left(void);
void process_button_middle(void);
void process_button_right(void);
void update_display(void);
void send_game_state(void);
void send_crosshair_position(void);
void send_hit_event(uint8_t ship_type, uint8_t points);
void send_miss_event(void);
void calculate_accuracy(void);

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

/**
  * @brief ? ? ? UART
  * @param format: ? 
  */
void log_message(const char* format, ...) {
    if (!logging_enabled) return;
    
    va_list args;
    va_start(args, format);
    int len = vsprintf(log_buffer, format, args);
    va_end(args);
    
    if (len < sizeof(log_buffer) - 2) {
        log_buffer[len] = '\r';
        log_buffer[len + 1] = '\n';
        log_buffer[len + 2] = '\0';
        HAL_UART_Transmit(&huart2, (uint8_t*)log_buffer, len + 2, 100);
    }
}

/**
  * @brief ? ? ?
  * @param event: ?
  * @param data:  ?
  */
void log_game_event(const char* event, uint32_t data) {
    log_message("GAME_EVENT:%s:%lu", event, data);
}

/**
  * @brief  ? ? ? ? ?
  * @param z:  ? 
  */
void writeByteToDisplay(uint8_t z) {
    for(int i = 0; i < 8; ++i) {
        HAL_GPIO_WritePin(SEG_DATA_GPIO_Port, SEG_DATA_Pin, 
                         ((z & 0x80) != 0) ? GPIO_PIN_SET : GPIO_PIN_RESET);
        HAL_GPIO_WritePin(SHIFT_CLOCK_GPIO_Port, SHIFT_CLOCK_Pin, GPIO_PIN_RESET);
        HAL_GPIO_WritePin(SHIFT_CLOCK_GPIO_Port, SHIFT_CLOCK_Pin, GPIO_PIN_SET);
        z <<= 1;
    }
}

/**
  * @brief    ?
  * @param z: ? ?
  * @param val:  ? ?
  */
void writeSegmentToDisplay(uint8_t z, uint8_t val) {
    HAL_GPIO_WritePin(SHIFT_LATCH_GPIO_Port, SHIFT_LATCH_Pin, GPIO_PIN_RESET);
    writeByteToDisplay(val);
    writeByteToDisplay(z);
    HAL_GPIO_WritePin(SHIFT_LATCH_GPIO_Port, SHIFT_LATCH_Pin, GPIO_PIN_SET);
}

/**
  * @brief ? ? ? ?   ?
  * @param number: ? ? ?
  */
void displayFloatNumber(float number) {
    if(number > 9.99f) number = 9.99f;
    if(number < -9.99f) number = -9.99f;

    int negative = (number < 0);
    if(negative) number = -number;

    int scaled = (int)(number * 100 + 0.5f);

    int d1 = scaled / 100;           
    int d2 = (scaled / 10) % 10;     
    int d3 = scaled % 10;            
    
    disp_buf[0] = seg_digits[d3];              
    disp_buf[1] = seg_digits[d2];    
    disp_buf[2] = seg_digits[d1] & seg_dot;              
    disp_buf[3] = negative ? seg_minus : 0xFF; 
}

/**
  * @brief ?  ? ? ?
  * @param min: ? 
  * @param max:  
  * @return ? ?
  */
uint32_t get_random(uint32_t min, uint32_t max) {
    if (random_seed == 0) {
        random_seed = HAL_GetTick();
    }
    
    random_seed = random_seed * 1103515245 + 12345;
    return min + (random_seed % (max - min + 1));
}

/**
  * @brief ? 
  */
void init_game(void) {
    // ? ? 
    score = 0;
    hits = 0;
    shots = 0;
    accuracy = 0;
    game_timer = GAME_TIME;
    
    // ? ?
    crosshair.x = 50;  // ?  ?
    crosshair.y = 50;  // ?  ?
    crosshair.locked = 0;
    crosshair.direction = 0;  // 0 - ?, 1 - 
    
    // ? ? 
    for (int i = 0; i < MAX_SHIPS; i++) {
        ships[i].active = 0;
    }
    
    //  ? 
    game_start_time = HAL_GetTick();
    game_state = GAME_ACTIVE;
    
    log_game_event("GAME_START", 0);
    log_message("SCORE:0 HITS:0 SHOTS:0 ACC:0%%");
}

/**
  * @brief   ?
  */
void spawn_ship(void) {
    uint32_t current_time = HAL_GetTick();
    
    if (current_time - last_spawn_time < 2000) {  // ? ? 2 ?
        return;
    }
    
    // ?  ? ? ?
    int free_slot = -1;
    for (int i = 0; i < MAX_SHIPS; i++) {
        if (!ships[i].active) {
            free_slot = i;
            break;
        }
    }
    
    if (free_slot == -1) {
        return;  // ? ? 
    }
    
    // ?  ?  ?
    uint32_t chance = get_random(0, 100);
    ShipType ship_type;
    
    if (chance < SPAWN_CHANCE_SMALL) {
        ship_type = SHIP_SMALL;
    } else if (chance < SPAWN_CHANCE_SMALL + SPAWN_CHANCE_MEDIUM) {
        ship_type = SHIP_MEDIUM;
    } else {
        ship_type = SHIP_LARGE;
    }
    
    // ? ?
    ships[free_slot].x = get_random(10, 90);  //   ?
    ships[free_slot].y = get_random(10, 70);  //  ? ? (?   )
    ships[free_slot].type = ship_type;
    ships[free_slot].active = 1;
    
    last_spawn_time = current_time;
    
    //   ? ? ?
    char ship_char = 'S';
    if (ship_type == SHIP_MEDIUM) ship_char = 'M';
    if (ship_type == SHIP_LARGE) ship_char = 'L';
    
    log_message("SHIP_SPAWN:%c,%d,%d", ship_char, ships[free_slot].x, ships[free_slot].y);
    
    //  ? UART ? ?-
    char uart_buffer[32];
    int len = sprintf(uart_buffer, "SHIP:%c:%d:%d\r\n", ship_char, ships[free_slot].x, ships[free_slot].y);
    HAL_UART_Transmit(&huart2, (uint8_t*)uart_buffer, len, 100);
}

/**
  * @brief  ? ?
  */
void update_crosshair(void) {
    uint32_t current_time = HAL_GetTick();
    
    // ?   ? ? ?
    if (current_time - last_move_time > 50) {  //   50
        if (!crosshair.locked) {
            if (continuous_left && crosshair.x > 0) {
                if (crosshair.x >= move_speed) {
                    crosshair.x -= move_speed;
                } else {
                    crosshair.x = 0;
                }
            }
            if (continuous_right && crosshair.x < FIELD_WIDTH) {
                if (crosshair.x <= FIELD_WIDTH - move_speed) {
                    crosshair.x += move_speed;
                } else {
                    crosshair.x = FIELD_WIDTH;
                }
            }
        } else {
            //    ? 
            if (current_time - last_vertical_move_time > 100) {  //   100
                if (crosshair.direction == 0) {  //  ?
                    if (crosshair.y > 0) {
                        if (crosshair.y >= move_speed) {
                            crosshair.y -= move_speed;
                        } else {
                            crosshair.y = 0;
                            crosshair.direction = 1;  //  ?
                        }
                    } else {
                        crosshair.direction = 1;  //  ?
                    }
                } else {  //  
                    if (crosshair.y < FIELD_HEIGHT) {
                        if (crosshair.y <= FIELD_HEIGHT - move_speed) {
                            crosshair.y += move_speed;
                        } else {
                            crosshair.y = FIELD_HEIGHT;
                            crosshair.direction = 0;  //  ?
                        }
                    } else {
                        crosshair.direction = 0;  //  ?
                    }
                }
                last_vertical_move_time = current_time;
            }
        }
        
        last_move_time = current_time;
        
        //  ? ?
        send_crosshair_position();
    }
}

/**
  * @brief  ?
  */
void check_hits(void) {
    for (int i = 0; i < MAX_SHIPS; i++) {
        if (ships[i].active) {
            // ?  ?  ? 
            int dx = abs((int)crosshair.x - (int)ships[i].x);
            int dy = abs((int)crosshair.y - (int)ships[i].y);
            float distance = sqrt(dx*dx + dy*dy);
            
            //   ? ? ?  
            uint8_t ship_radius = HIT_RADIUS;
            if (ships[i].type == SHIP_SMALL) ship_radius = HIT_RADIUS - 1;
            if (ships[i].type == SHIP_LARGE) ship_radius = HIT_RADIUS + 1;
            
            if (distance <= ship_radius) {
                // ?!
                uint8_t points = 0;
                if (ships[i].type == SHIP_SMALL) points = SCORE_SMALL;
                else if (ships[i].type == SHIP_MEDIUM) points = SCORE_MEDIUM;
                else points = SCORE_LARGE;
                
                score += points;
                hits++;
                
                //  ? ?
                send_hit_event(ships[i].type, points);
                
                // ? ?
                ships[i].active = 0;
                
                //   ?
                HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_RESET);
                HAL_Delay(100);
                HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_SET);
                
                return;  // ?  ?  ?  ?
            }
        }
    }
    
    // 
    send_miss_event();
    
    //    ?
    HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_RESET);
    HAL_Delay(50);
    HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_SET);
}

/**
  * @brief 
  */
void fire(void) {
    shots++;
    calculate_accuracy();
    
    log_message("FIRE:POS:%d:%d", crosshair.x, crosshair.y);
    
    //  ?
    check_hits();
    
    // ? ? ? 
    crosshair.locked = 0;
    
    //   ? 
    send_game_state();
}

/**
  * @brief  ? 
  */
void process_button_left(void) {
    if (game_state != GAME_ACTIVE) return;
    
    if (!crosshair.locked) {
        continuous_left = 1;
        log_message("MOVE:LEFT:START");
    }
}

/**
  * @brief  ? 
  */
void process_button_middle(void) {
    if (game_state != GAME_ACTIVE) return;
    
    if (!crosshair.locked) {
        //  ?
        crosshair.locked = 1;
        crosshair.direction = 0;  //   ?
        log_message("CROSSHAIR:LOCKED");
        log_game_event("CROSSHAIR_LOCK", 1);
    } else {
        // ?
        fire();
        log_message("CROSSHAIR:FIRE");
        log_game_event("FIRE", 1);
    }
}

/**
  * @brief   
  */
void process_button_right(void) {
    if (game_state != GAME_ACTIVE) return;
    
    if (!crosshair.locked) {
        continuous_right = 1;
        log_message("MOVE:RIGHT:START");
    }
}

/**
  * @brief  ?
  */
void update_display(void) {
    if (game_state == GAME_ACTIVE) {
        //    ?
        displayFloatNumber((float)score);
    } else {
        //  0
        displayFloatNumber(0);
    }
}

/**
  * @brief  ?  ? UART
  */
void send_game_state(void) {
    char buffer[64];
    int len = sprintf(buffer, "GAME:%u:%u:%u:%u:%u\r\n", 
                     score, hits, shots, accuracy, game_timer);
    HAL_UART_Transmit(&huart2, (uint8_t*)buffer, len, 100);
}

/**
  * @brief  ? ? ? UART
  */
void send_crosshair_position(void) {
    char buffer[32];
    int len = sprintf(buffer, "CROSSHAIR:%u:%u:%u\r\n", 
                     crosshair.x, crosshair.y, crosshair.locked);
    HAL_UART_Transmit(&huart2, (uint8_t*)buffer, len, 100);
}

/**
  * @brief  ? ? ? UART
  * @param ship_type: ? ?
  * @param points:   ?
  */
void send_hit_event(uint8_t ship_type, uint8_t points) {
    char ship_char = 'S';
    if (ship_type == SHIP_MEDIUM) ship_char = 'M';
    if (ship_type == SHIP_LARGE) ship_char = 'L';
    
    char buffer[32];
    int len = sprintf(buffer, "HIT:%c:%u\r\n", ship_char, points);
    HAL_UART_Transmit(&huart2, (uint8_t*)buffer, len, 100);
    
    log_message("HIT:%c:%u POINTS", ship_char, points);
    log_game_event("HIT", points);
}

/**
  * @brief  ? ? ? UART
  */
void send_miss_event(void) {
    char buffer[16];
    int len = sprintf(buffer, "MISS\r\n");
    HAL_UART_Transmit(&huart2, (uint8_t*)buffer, len, 100);
    
    log_message("MISS");
    log_game_event("MISS", 0);
}

/**
  * @brief   
  */
void calculate_accuracy(void) {
    if (shots > 0) {
        accuracy = (hits * 100) / shots;
    } else {
        accuracy = 0;
    }
}

/* USER CODE END 0 */

/**
  * @brief     GPIO
  * @param  GPIO_Pin: ?, ? 
  */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {
    uint32_t current_time = HAL_GetTick();
    
    switch (GPIO_Pin) {
        case LEFT_BUTTON_Pin: 
            if (current_time - left_button_last_time > DEBOUNCE_DELAY) {
                left_button_last_time = current_time;
                process_button_left();
            }
            break;
            
        case MIDDLE_BUTTON_Pin: 
            if (current_time - middle_button_last_time > DEBOUNCE_DELAY) {
                middle_button_last_time = current_time;
                process_button_middle();
            }
            break;
            
        case RIGHT_BUTTON_Pin: 
            if (current_time - right_button_last_time > DEBOUNCE_DELAY) {
                right_button_last_time = current_time;
                process_button_right();
            }
            break;
    }
}

/**
  * @brief   ? ?
  * @param  htim: ? ?
  */
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
    static uint32_t display_counter = 0;
    
    if (htim->Instance == TIM2) {
        //  ?  5 ?
        if (++display_counter >= 5) {
            update_display();
            display_counter = 0;
        }
        
        //  ? 
        if (game_state == GAME_ACTIVE) {
            uint32_t current_time = HAL_GetTick();
            
            //  ?   ?
            if (current_time - game_start_time >= 1000) {
                if (game_timer > 0) {
                    game_timer--;
                    game_start_time = current_time;
                    
                    if (game_timer == 0) {
                        game_state = GAME_ENDED;
                        log_game_event("GAME_END", score);
                        log_message("GAME_OVER FINAL_SCORE:%lu ACCURACY:%u%%", score, accuracy);
                    }
                }
            }
            
            //  ?
            update_crosshair();
            
            //  ? 
            spawn_ship();
            
            //  ?  
            static uint32_t last_state_send = 0;
            if (current_time - last_state_send >= 1000) {  //  ?
                send_game_state();
                last_state_send = current_time;
            }
        }
    }
}

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void) {
    /* USER CODE BEGIN 1 */
    /* USER CODE END 1 */

    /* MCU Configuration--------------------------------------------------------*/

    /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
    HAL_Init();

    /* USER CODE BEGIN Init */
    /* USER CODE END Init */

    /* Configure the system clock */
    SystemClock_Config();

    /* USER CODE BEGIN SysInit */
    /* USER CODE END SysInit */

    /* Initialize all configured peripherals */
    MX_GPIO_Init();
    MX_TIM2_Init();
    MX_USART2_UART_Init();
    
    /* USER CODE BEGIN 2 */
    // ? ?
    HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_SET);
    
    //  ? ?
    seg_minus = ~seg_minus;
    seg_dot = ~seg_dot;
    
    // ?  
    random_seed = HAL_GetTick();
    
    // ? ? 
    init_game();
    
    //  ?
    HAL_TIM_Base_Start_IT(&htim2);
    
    //   ?
    send_game_state();
    log_message("SYSTEM_INITIALIZED");
    log_message("GAME_READY");
    
    /* USER CODE END 2 */

    /* Infinite loop */
    /* USER CODE BEGIN WHILE */
    while (1) {
        //  ? ?  ?
        for (int i = 0; i < 4; i++) {
            writeSegmentToDisplay(seg_nums[i], disp_buf[i]);
        }
        
        //    ?  
        uint32_t current_time = HAL_GetTick();
        if (current_time - left_button_last_time > 200) {  // 200 
            continuous_left = 0;
        }
        if (current_time - right_button_last_time > 200) {
            continuous_right = 0;
        }
        
        // ?   UART ( ?)
        uint8_t uart_buffer;
        if (HAL_UART_Receive(&huart2, &uart_buffer, 1, 10) == HAL_OK) {
            // ?   ?-
            if (uart_buffer == 'S') {  // ? 
                if (game_state != GAME_ACTIVE) {
                    init_game();
                    log_message("WEB_COMMAND:GAME_START");
                }
            }
            else if (uart_buffer == 'R') {  // ? 
                init_game();
                log_message("WEB_COMMAND:GAME_RESET");
            }
            else if (uart_buffer == 'P') {  // ?
                if (game_state == GAME_ACTIVE) {
                    game_state = GAME_PAUSED;
                    log_message("WEB_COMMAND:GAME_PAUSE");
                } else if (game_state == GAME_PAUSED) {
                    game_state = GAME_ACTIVE;
                    log_message("WEB_COMMAND:GAME_RESUME");
                }
            }
        }
        
        /* USER CODE END WHILE */
        /* USER CODE BEGIN 3 */
    }
    /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void) {
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    /** Initializes the RCC Oscillators according to the specified parameters
    * in the RCC_OscInitTypeDef structure.
    */
    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
    RCC_OscInitStruct.HSIState = RCC_HSI_ON;
    RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
    RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
    RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI_DIV2;
    RCC_OscInitStruct.PLL.PLLMUL = RCC_PLL_MUL16;
    if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) {
        Error_Handler();
    }

    /** Initializes the CPU, AHB and APB buses clocks
    */
    RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                                |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
    RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
    RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
    RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
    RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

    if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK) {
        Error_Handler();
    }
}

/* USER CODE BEGIN 4 */
/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void) {
    /* USER CODE BEGIN Error_Handler_Debug */
    /* USER CODE END Error_Handler_Debug */
}

#ifdef  USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line) {
    /* USER CODE BEGIN 6 */
    /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */

