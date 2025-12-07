/* USER CODE BEGIN Header */
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

extern DMA_HandleTypeDef hdma_usart2_rx;  
extern DMA_HandleTypeDef hdma_usart2_tx; 

#define DEBOUNCE_DELAY          20
#define CMD_LINE_SIZE           32
#define MAX_SHIPS               30
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

// Crosshair (FULL STATE ON STM32)
volatile uint16_t crosshair_x = 400;
volatile uint16_t crosshair_y = 300;
volatile uint8_t crosshair_locked = 0;
volatile int8_t vertical_direction = 1;

// Ships
Ship ships[MAX_SHIPS] = {0};


void SystemClock_Config(void);
uint8_t is_uart_tx_ready(void);

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

    uint16_t x = 40 + (get_random() % (FIELD_WIDTH - 80));
    uint16_t y = 40 + (get_random() % (FIELD_HEIGHT - 140));

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
    for (int i = 0; i < MAX_SHIPS; i++) {
        if (ships[i].active) {
            int dx = ch_x - ships[i].x;
            int dy = ch_y - ships[i].y;
            int dist_sq = dx * dx + dy * dy;
            int r = (ships[i].type == 10) ? 25 :
                    (ships[i].type == 20) ? 35 : 45;
            if (dist_sq <= r * r) {
                hit = 1;
                hit_type = ships[i].type;
                hit_index = i;
                break;
            }
        }
    }
    if (hit) {
        ships[hit_index].active = 0;
        log_to_buffer("RESULT:HIT:%d", hit_type);
    } else {
        log_to_buffer("RESULT:MISS");
    }
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
            // Do NOT clear here — cleared in main after handling
        } else if (strlen(cmd_line) < CMD_LINE_SIZE - 1) {
            strncat(cmd_line, (char*)&ch, 1);
        } else {
            cmd_ready = 0;
            memset(cmd_line, 0, sizeof(cmd_line));
        }
    }
}

// =============== BUTTONS & CROSSHAIR ===============
void process_buttons(uint32_t current_time) {
    static uint32_t last_check = 0;
    if (current_time - last_check < 30) return;
    last_check = current_time;

    uint8_t left_now = HAL_GPIO_ReadPin(LEFT_BUTTON_GPIO_Port, LEFT_BUTTON_Pin);
    uint8_t right_now = HAL_GPIO_ReadPin(RIGHT_BUTTON_GPIO_Port, RIGHT_BUTTON_Pin);
    uint8_t middle_now = HAL_GPIO_ReadPin(MIDDLE_BUTTON_GPIO_Port, MIDDLE_BUTTON_Pin);

    // LEFT
    if (left_button_prev == 1 && left_now == 0) {
        if (game_started && !game_paused && !crosshair_locked) {
            if (crosshair_x > MIN_X + CROSSHAIR_STEP_X) crosshair_x -= CROSSHAIR_STEP_X;
            log_to_buffer("CROSSHAIR:%d,%d", crosshair_x, crosshair_y);
        }
    }
    left_button_prev = left_now;

    // RIGHT
    if (right_button_prev == 1 && right_now == 0) {
        if (game_started && !game_paused && !crosshair_locked) {
            if (crosshair_x < MAX_X - CROSSHAIR_STEP_X) crosshair_x += CROSSHAIR_STEP_X;
            log_to_buffer("CROSSHAIR:%d,%d", crosshair_x, crosshair_y);
        }
    }
    right_button_prev = right_now;

    // MIDDLE
    if (middle_button_prev == 1 && middle_now == 0) {
        if (game_started && !game_paused) {
            if (!crosshair_locked) {
                crosshair_locked = 1;
                log_to_buffer("LOCK:1");
                log_to_buffer("CROSSHAIR:%d,%d", crosshair_x, crosshair_y);
            } else {
                crosshair_locked = 0;
                check_ship_hit(crosshair_x, crosshair_y);
                log_to_buffer("LOCK:0");
                log_to_buffer("CROSSHAIR:%d,%d", crosshair_x, crosshair_y);
            }
        }
    }
    middle_button_prev = middle_now;
}

// =============== GAME UPDATE ===============
void update_game_logic(uint32_t current_time) {
    if (!game_started || game_paused) return;

    // Spawn ships
    if (current_time - last_ship_spawn >= 2000) {
        last_ship_spawn = current_time;
        spawn_ship();
    }

    // Timer
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

    // Vertical movement
    if (crosshair_locked) {
        crosshair_y += vertical_direction * CROSSHAIR_STEP_Y;
        if (crosshair_y <= MIN_Y) {
            crosshair_y = MIN_Y;
            vertical_direction = 1;
        } else if (crosshair_y >= MAX_Y) {
            crosshair_y = MAX_Y;
            vertical_direction = -1;
        }

        static uint32_t last_pos_send = 0;
        if (current_time - last_pos_send >= 50) {
            last_pos_send = current_time;
            log_to_buffer("CROSSHAIR:%d,%d", crosshair_x, crosshair_y);
        }
    }
}

// =============== COMMAND HANDLING ===============
void handle_commands(void) {
    if (!cmd_ready) return;
    cmd_ready = 0;
    char *cmd = cmd_line;

    if (strncmp(cmd, "CMD:START", 9) == 0) {
        game_time = 60;
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
        log_to_buffer("CROSSHAIR:%d,%d", crosshair_x, crosshair_y);
        log_to_buffer("LOCK:0");
    }
    else if (strncmp(cmd, "CMD:PAUSE", 9) == 0) {
        game_started = 1;
        game_paused = !game_paused;
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
        log_to_buffer("CROSSHAIR:%d,%d", crosshair_x, crosshair_y);
        log_to_buffer("LOCK:0");
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
		HAL_Init();
		SystemClock_Config();
		MX_GPIO_Init();
		MX_DMA_Init();
		MX_TIM2_Init();
		MX_USART2_UART_Init();
		HAL_UART_Receive_DMA(&huart2, rx_dma_buffer, RX_BUFFER_SIZE);
		HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_SET);
		last_second_tick = HAL_GetTick();
		last_blink_tick = HAL_GetTick();
		
		uint32_t last_button_check = 0;
		uint32_t last_second_tick = 0;
		uint32_t last_blink_tick = 0;
		while (1)
		{
				uint32_t current_time = HAL_GetTick();

				check_uart_commands();
				handle_commands();
				process_buttons(current_time);
				update_game_logic(current_time);

				// Display blink on pause
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

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI_DIV2;
  RCC_OscInitStruct.PLL.PLLMUL = RCC_PLL_MUL16;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
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

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK)
  {
    Error_Handler();
  }
}

/* USER CODE BEGIN 4 */
/* USER CODE END 4 */

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
