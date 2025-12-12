/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    main.c
  * @brief   Main program body for naval game with COM-device control
  ******************************************************************************
  */
/* USER CODE END Header */

/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "dma.h"
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
/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
#define DEBOUNCE_DELAY          20
#define CMD_LINE_SIZE           32
#define MAX_SHIPS               25
#define FIELD_WIDTH             800
#define FIELD_HEIGHT            600
#define RX_BUFFER_SIZE          32

// Crosshair movement
#define CROSSHAIR_STEP_X        25
#define CROSSHAIR_STEP_Y        3
#define MIN_X                   40
#define MAX_X                   (FIELD_WIDTH - 40)
#define MIN_Y                   40
#define MAX_Y                   (FIELD_HEIGHT - 40)

typedef struct {
    uint8_t active;
    uint8_t type;
    uint16_t x;
    uint16_t y;
} Ship;
/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
/* USER CODE BEGIN PV */
// UART DMA
extern DMA_HandleTypeDef hdma_usart2_rx;
extern DMA_HandleTypeDef hdma_usart2_tx;
uint8_t rx_dma_buffer[RX_BUFFER_SIZE] = {0};
char cmd_line[CMD_LINE_SIZE] = {0};
uint8_t cmd_ready = 0;

// UART TX control
volatile uint8_t uart_tx_busy = 0;

// Display
uint8_t disp_buf[4] = {0xFF, 0xFF, 0xFF, 0xFF};
uint8_t seg_nums[4] = {0xF8, 0xF4, 0xF2, 0xF1};
uint8_t seg_digits[10] = {0xC0, 0xF9, 0xA4, 0xB0, 0x99, 0x92, 0x82, 0xF8, 0x80, 0x90};

// Logging
volatile uint8_t logging_enabled = 1;

// Buttons
volatile uint8_t left_button_prev = 1;
volatile uint8_t right_button_prev = 1;
volatile uint8_t middle_button_prev = 1;

// Game state
volatile uint8_t game_started = 0;
volatile uint8_t game_paused = 0;
volatile uint8_t game_time = 60;
volatile uint32_t last_second_tick = 0;
volatile uint32_t last_blink_tick = 0;
volatile uint8_t display_on = 1;
volatile uint32_t last_ship_spawn = 0;

// Crosshair state
uint32_t crosshair_locked = 0;
uint32_t crosshair_x = 400;
uint32_t crosshair_y = 300;
uint32_t vertical_direction = 1;

// Ships
Ship ships[MAX_SHIPS] = {0};

// Storm
volatile uint32_t last_storm_update = 0;
const uint32_t STORM_UPDATE_INTERVAL_MS = 100; 
volatile float storm_amplitude_x = 25.0f;      
volatile float storm_amplitude_y = 12.0f; 
const float STORM_PERIOD_X_MS = 2400.0f;
const float STORM_PERIOD_Y_MS = 1900.0f;  
// Storm activation logic
volatile uint8_t storm_active = 1;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
/* USER CODE BEGIN PFP */
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

// =============== UART / LOGGING ===============
void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart) {
    if (huart->Instance == USART2) {
        uart_tx_busy = 0;
    }
}

uint8_t is_uart_tx_ready(void) {
    return (__HAL_DMA_GET_COUNTER(&hdma_usart2_tx) == 0);
}

void log_to_buffer(const char* format, ...) {
    if (!logging_enabled) return;
    static char tx_buffer[128];
    if (uart_tx_busy) return;

    va_list args;
    va_start(args, format);
    int len = vsnprintf(tx_buffer, sizeof(tx_buffer) - 2, format, args);
    va_end(args);
    if (len <= 0) return;

    tx_buffer[len] = '\r';
    tx_buffer[len + 1] = '\n';
    len += 2;

    uart_tx_busy = 1;
    HAL_UART_Transmit_DMA(&huart2, (uint8_t*)tx_buffer, len);
}

// =============== DISPLAY ===============
void writeByteToDisplay(uint8_t z) {
    for (int i = 0; i < 8; ++i) {
        HAL_GPIO_WritePin(SEG_DATA_GPIO_Port, SEG_DATA_Pin, ((z & 0x80) != 0) ? GPIO_PIN_SET : GPIO_PIN_RESET);
        HAL_GPIO_WritePin(SHIFT_CLOCK_GPIO_Port, SHIFT_CLOCK_Pin, GPIO_PIN_RESET);
        HAL_GPIO_WritePin(SHIFT_CLOCK_GPIO_Port, SHIFT_CLOCK_Pin, GPIO_PIN_SET);
        z <<= 1;
    }
}

void writeSegmentToDisplay(uint8_t z, uint8_t val) {
    HAL_GPIO_WritePin(SHIFT_LATCH_GPIO_Port, SHIFT_LATCH_Pin, GPIO_PIN_RESET);
    writeByteToDisplay(val);
    writeByteToDisplay(z);
    HAL_GPIO_WritePin(SHIFT_LATCH_GPIO_Port, SHIFT_LATCH_Pin, GPIO_PIN_SET);
}

void displayInt(uint8_t value) {
    if (value > 99) value = 99;
    uint8_t tens = value / 10;
    uint8_t ones = value % 10;
    disp_buf[3] = 0xFF;
    disp_buf[2] = 0xFF;
    disp_buf[1] = seg_digits[tens];
    disp_buf[0] = seg_digits[ones];
}

void updateDisplay(void) {
    if (!display_on) {
        for (int i = 0; i < 4; i++) {
            writeSegmentToDisplay(seg_nums[i], 0xFF);
        }
        return;
    }
    displayInt(game_time);
    for (int i = 0; i < 4; i++) {
        writeSegmentToDisplay(seg_nums[i], disp_buf[i]);
    }
}

// =============== GAME LOGIC ===============
uint32_t get_random(void) {
    return HAL_GetTick() ^ (HAL_GetTick() << 5) ^ (HAL_GetTick() >> 3);
}

void spawn_ship(void) {
    int free_slot = -1;
    for (int i = 0; i < MAX_SHIPS; i++) {
        if (!ships[i].active) {
            free_slot = i;
            break;
        }
    }
    if (free_slot == -1) return;

    uint8_t type;
    uint32_t r = get_random() % 100;
    if (r < 50) type = 10;
    else if (r < 80) type = 20;
    else type = 30;

    uint16_t x = MIN_X + (get_random() % (MAX_X - MIN_X + 1));
    uint16_t y = MIN_Y + (get_random() % (MAX_Y - MIN_Y + 1));

    ships[free_slot].active = 1;
    ships[free_slot].type = type;
    ships[free_slot].x = x;
    ships[free_slot].y = y;

    log_to_buffer("SHIP:%d,%d,%d", type, x, y);
}

void check_ship_hit(uint16_t ch_x, uint16_t ch_y) {
    int hit = 0;
    uint8_t hit_type = 0;
    int hit_index = -1;
    uint16_t hit_x = 0;
    uint16_t hit_y = 0;
    
    for (int i = 0; i < MAX_SHIPS; i++) {
        if (ships[i].active) {
            int dx = ch_x - ships[i].x;
            int dy = ch_y - ships[i].y;
            int dist_sq = dx * dx + dy * dy;
            
            int r_squared;
            if (ships[i].type == 10) {
                r_squared = 25 * 25; 
            } else if (ships[i].type == 20) {
                r_squared = 35 * 35;  
            } else {
                r_squared = 45 * 45;  
            }
            
            if (dist_sq <= r_squared) {
                hit = 1;
                hit_type = ships[i].type;
                hit_index = i;
                hit_x = ships[i].x;
                hit_y = ships[i].y;
                break;
            }
        }
    }
    if (hit) {
        ships[hit_index].active = 0;
        log_to_buffer("RESULT:HIT:%d,%d,%d", hit_type, hit_x, hit_y); 
    } else {
        log_to_buffer("RESULT:MISS,%d,%d", ch_x, ch_y);
    }
}
// =============== STORM GENERATOR ===============
void get_storm_offsets(int16_t* out_x, int16_t* out_y) {
    uint32_t t = HAL_GetTick();
    float phase_x = 2.0f * 3.14159265f * (t % (uint32_t)STORM_PERIOD_X_MS) / STORM_PERIOD_X_MS;
    float phase_y = 2.0f * 3.14159265f * (t % (uint32_t)STORM_PERIOD_Y_MS) / STORM_PERIOD_Y_MS;
    *out_x = (int16_t)(storm_amplitude_x * sinf(phase_x));
    *out_y = (int16_t)(storm_amplitude_y * sinf(phase_y + 0.7f)); 
}
// =============== UART COMMANDS ===============
void check_uart_commands(void) {
    static uint8_t checked_index = 0;
    uint16_t current_index = RX_BUFFER_SIZE - __HAL_DMA_GET_COUNTER(&hdma_usart2_rx);
    if (current_index >= RX_BUFFER_SIZE) current_index = 0;

    while (checked_index != current_index) {
        uint8_t ch = rx_dma_buffer[checked_index];
        checked_index = (checked_index + 1) % RX_BUFFER_SIZE;

        if (ch == '\r' || ch == '\n') {
            if (cmd_ready == 0 && strlen(cmd_line) > 0) {
                cmd_ready = 1;
            }
        } else if (strlen(cmd_line) < CMD_LINE_SIZE - 1) {
            strncat(cmd_line, (char*)&ch, 1);
        } else {
            cmd_ready = 0;
            memset(cmd_line, 0, sizeof(cmd_line));
        }
    }
}

// =============== BUTTON HANDLING ===============
void process_buttons(uint32_t current_time) {
    static uint32_t last_check = 0;
    if (current_time - last_check < 30) return;
    last_check = current_time;

    uint8_t left_now = HAL_GPIO_ReadPin(LEFT_BUTTON_GPIO_Port, LEFT_BUTTON_Pin);
    uint8_t right_now = HAL_GPIO_ReadPin(RIGHT_BUTTON_GPIO_Port, RIGHT_BUTTON_Pin);
    uint8_t middle_now = HAL_GPIO_ReadPin(MIDDLE_BUTTON_GPIO_Port, MIDDLE_BUTTON_Pin);

    // LEFT
    if (left_button_prev == 1 && left_now == 0) {
        if (game_started && !game_paused) {
						if (crosshair_x > MIN_X) {
							crosshair_x -= CROSSHAIR_STEP_X;
						}		  
						log_to_buffer("CROSSHAIR_STEP_LEFT");
        }
    }
    left_button_prev = left_now;

    // RIGHT
    if (right_button_prev == 1 && right_now == 0) {
        if (game_started && !game_paused) {
            if (crosshair_x < MAX_X) {
								crosshair_x += CROSSHAIR_STEP_X;
						}
						log_to_buffer("CROSSHAIR_STEP_RIGHT");
        }
    }
    right_button_prev = right_now;

    // MIDDLE
		if (middle_button_prev == 1 && middle_now == 0) {
				if (game_started && !game_paused) {
						
						if (!crosshair_locked) {
								crosshair_locked = 1;
								log_to_buffer("MIDDLE_CLICK:%d,%d", crosshair_x, crosshair_y);
								
						} else {
								crosshair_locked = 0;
								log_to_buffer("MIDDLE_CLICK:%d,%d", crosshair_x, crosshair_y);
						}
				}
		}
    middle_button_prev = middle_now;
}

// =============== GAME UPDATE ===============
void update_game_logic(uint32_t current_time) {
    if (!game_started || game_paused) return;

    // Spawn ships every 2 seconds
    if (current_time - last_ship_spawn >= 4000) {
        last_ship_spawn = current_time;
        spawn_ship();
    }

    // Timer tick every second
    if (current_time - last_second_tick >= 1000) {
        last_second_tick = current_time;
        if (game_time > 0) {
            game_time--;
            log_to_buffer("TIME:%d", game_time);
            if (game_time == 0) {
								game_started = 0;
            }
        }
    }
		
		// Storm logic
		if (current_time - last_storm_update >= STORM_UPDATE_INTERVAL_MS) {
        last_storm_update = current_time;
        int16_t sx, sy;
        get_storm_offsets(&sx, &sy);
        log_to_buffer("STORM:%d,%d", sx, sy);
    }
}

// =============== COMMAND HANDLING ===============
void handle_commands(void) {
    if (!cmd_ready) return;
    cmd_ready = 0;
    char *cmd = cmd_line;

    if (strncmp(cmd, "CMD:START", 9) == 0) {	
        game_started = 1;
        game_paused = 0;
        crosshair_locked = 0;
        crosshair_x = 400;
        crosshair_y = 300;
        vertical_direction = 1;
        for (int i = 0; i < MAX_SHIPS; i++) ships[i].active = 0;
        last_ship_spawn = HAL_GetTick();
        last_second_tick = HAL_GetTick();
        log_to_buffer("COM: START=%d, PAUSE=%d", game_started, game_paused);
        log_to_buffer("TIME:%d", game_time);
    }
    else if (strncmp(cmd, "CMD:PAUSE", 9) == 0) {
        game_started = 1;
        game_paused = !game_paused;
				if (!game_paused) {
						last_second_tick = HAL_GetTick();
				}
        log_to_buffer("COM: START=%d, PAUSE=%d", game_started, game_paused);
    }
    else if (strncmp(cmd, "CMD:RESET", 9) == 0) {
				game_started = 0;
        game_paused = 0;
        game_time = 60;
        crosshair_locked = 0;
        crosshair_x = 400;
        crosshair_y = 300;
        for (int i = 0; i < MAX_SHIPS; i++) ships[i].active = 0;
        log_to_buffer("COM: reset=1");
        log_to_buffer("TIME:%d", game_time);
    }
    else if (strncmp(cmd, "CMD:SHOT:", 9) == 0) {
				char *comma = strchr(cmd + 9, ',');
				if (comma) {
						uint16_t x = atoi(cmd + 9);      
						uint16_t y = atoi(comma + 1);      
						check_ship_hit(x, y);
						crosshair_locked = 0;             
				}
		}
		else if (strncmp(cmd, "CMD:STORM_UPDATE:", 17) == 0) {
				char* comma = strchr(cmd + 17, ',');
				if (comma) {
						int16_t delta_x = atoi(cmd + 17);
						int16_t delta_y = atoi(comma + 1);

						int16_t new_x = (int16_t)storm_amplitude_x + delta_x * 5;
						int16_t new_y = (int16_t)storm_amplitude_y + delta_y * 5;

						if (new_x < 0) new_x = 0;
						if (new_x > 50) new_x = 50;
						if (new_y < 0) new_y = 0;
						if (new_y > 50) new_y = 50;

						storm_amplitude_x = (float)new_x;
						storm_amplitude_y = (float)new_y;

						log_to_buffer("STORM_AMP_UPDATED:%d,%d", new_x, new_y);
				}
		}
    else {
        log_to_buffer("COM: unknown cmd: %s", cmd);
    }

    memset(cmd_line, 0, CMD_LINE_SIZE);
}
/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{
    /* MCU Configuration--------------------------------------------------------*/
    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    MX_DMA_Init();
    MX_TIM2_Init();
    MX_USART2_UART_Init();

    /* Initialize UART DMA */
    HAL_UART_Receive_DMA(&huart2, rx_dma_buffer, RX_BUFFER_SIZE);

    /* Initial state */
    HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_SET);
    last_second_tick = HAL_GetTick();
    last_blink_tick = HAL_GetTick();

    /* Infinite loop */
    while (1)
    {
        uint32_t current_time = HAL_GetTick();

        // =============== SERIAL COMMUNICATION ===============
        check_uart_commands();
        handle_commands();

        // =============== INPUT HANDLING ===============
        process_buttons(current_time);

        // =============== GAME LOGIC ===============
        update_game_logic(current_time);

        // =============== DISPLAY ===============
        if (game_started && game_paused) {
            if (current_time - last_blink_tick >= 500) {
                last_blink_tick = current_time;
                display_on = !display_on;
            }
        } else {
            display_on = 1;
        }
        updateDisplay();
    }
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
    RCC_OscInitStruct.HSIState = RCC_HSI_ON;
    RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
    RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
    RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI_DIV2;
    RCC_OscInitStruct.PLL.PLLMUL = RCC_PLL_MUL16;
    if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) {
        Error_Handler();
    }

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

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
    /* USER CODE BEGIN Error_Handler_Debug */
    /* USER CODE END Error_Handler_Debug */
}

#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
    /* USER CODE BEGIN 6 */
    /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
