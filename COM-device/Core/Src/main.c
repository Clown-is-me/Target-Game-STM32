/* USER CODE BEGIN Header */
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
/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

#define PI 3.14159f
#define DEBOUNCE_DELAY 20
#define LOG_BUFFER_SIZE 256
#define CMD_BUFFER_SIZE 32
#define MAX_SHIPS 30
#define FIELD_WIDTH 800
#define FIELD_HEIGHT 600


typedef struct {
    uint8_t active;
    uint8_t type;      // 10, 20, 30
    uint16_t x;
    uint16_t y;
} Ship;

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */
char log_ring_buffer[LOG_BUFFER_SIZE];
volatile uint8_t uart_rx_byte; 
volatile uint16_t log_write_idx = 0;
volatile uint16_t log_read_idx = 0;
volatile uint8_t log_pending = 0;

uint8_t disp_buf[4] = {0xFF, 0xFF, 0xFF, 0xFF};
uint8_t seg_nums[4] = {0xF8, 0xF4, 0xF2, 0xF1};
uint8_t seg_digits[10] = {0xC0, 0xF9, 0xA4, 0xB0, 0x99, 
													0x92, 0x82, 0xF8, 0x80, 0x90};
											
volatile uint8_t logging_enabled = 1;
char log_buffer[128];			

volatile uint8_t button_left_state = 0;
volatile uint8_t button_middle_state = 0;
volatile uint8_t button_right_state = 0;
volatile uint32_t button_left_last_time = 0;
volatile uint32_t button_middle_last_time = 0;
volatile uint32_t button_right_last_time = 0;

volatile uint8_t crosshair_locked = 0;
volatile uint32_t last_com_send_time = 0;
volatile uint8_t middle_button_click_count = 0;
													
volatile uint8_t game_started = 0;
volatile uint8_t game_paused = 0;
													
volatile char cmd_buffer[CMD_BUFFER_SIZE];
volatile uint8_t cmd_index = 0;
volatile uint8_t cmd_ready = 0;
													
volatile uint8_t game_time = 60;          
volatile uint32_t last_second_tick = 0;  
volatile uint8_t display_on = 1;          
volatile uint32_t last_blink_tick = 0;

//volatile uint8_t left_button_was_pressed = 0;
//volatile uint8_t right_button_was_pressed = 0;
volatile uint8_t left_button_prev = 1;   // 1 = ???????? (?? ?????????)
volatile uint8_t right_button_prev = 1;
volatile uint8_t middle_button_prev = 1;
volatile uint8_t middle_click_pending = 0; // ????: ?????? ???? ??????

Ship ships[MAX_SHIPS] = {0};
volatile uint32_t last_ship_spawn = 0;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
/* USER CODE BEGIN PFP */
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

void log_to_buffer(const char* format, ...) {
    if (!logging_enabled) return;
    
    va_list args;
    va_start(args, format);
    uint16_t next_idx = (log_write_idx + 1) % LOG_BUFFER_SIZE;
    
    if (next_idx == log_read_idx) {
        va_end(args);
        return;
    }
    
    char temp_buf[64];
    int len = vsnprintf(temp_buf, sizeof(temp_buf) - 2, format, args);
    va_end(args);
    
    if (len > 0) {
        if (len < sizeof(temp_buf) - 2) {
            temp_buf[len] = '\r';
            temp_buf[len + 1] = '\n';
            temp_buf[len + 2] = '\0';
            len += 2;
        }
        
        for (int i = 0; i < len && temp_buf[i] != '\0'; i++) {
            log_ring_buffer[log_write_idx] = temp_buf[i];
            log_write_idx = (log_write_idx + 1) % LOG_BUFFER_SIZE;
        }
        
        log_pending = 1;
    }
}
void process_logs(void) {
    while (log_read_idx != log_write_idx && __HAL_UART_GET_FLAG(&huart2, UART_FLAG_TXE)) {
        HAL_UART_Transmit(&huart2, (uint8_t*)&log_ring_buffer[log_read_idx], 1, 1);
        log_read_idx = (log_read_idx + 1) % LOG_BUFFER_SIZE;
    }
    
    if (log_read_idx == log_write_idx) {
        log_pending = 0;
    }
}
void log_message(const char* format, ...) {
    if (!logging_enabled) return;
    
    va_list args;
    va_start(args, format);
    
    char temp_buf[128];
    int len = vsnprintf(temp_buf, sizeof(temp_buf) - 2, format, args);
    va_end(args);
    
    if (len > 0) {
        // ????????? \r\n
        if (len < sizeof(temp_buf) - 2) {
            temp_buf[len] = '\r';
            temp_buf[len + 1] = '\n';
            temp_buf[len + 2] = '\0';
            len += 2;
        }
        
        log_to_buffer("%s", temp_buf);
    }
}

										
void writeByteToDisplay(uint8_t z){
	for(int i = 0; i < 8; ++i){
		HAL_GPIO_WritePin(SEG_DATA_GPIO_Port, SEG_DATA_Pin, ((z & 0x80) != 0) ? GPIO_PIN_SET : GPIO_PIN_RESET);
		HAL_GPIO_WritePin(SHIFT_CLOCK_GPIO_Port, SHIFT_CLOCK_Pin, GPIO_PIN_RESET);
		HAL_GPIO_WritePin(SHIFT_CLOCK_GPIO_Port, SHIFT_CLOCK_Pin, GPIO_PIN_SET);
		z <<= 1;
	}
}

void writeSegmentToDisplay(uint8_t z, uint8_t val){
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
    if (free_slot == -1) return; // ??? ?????

    uint8_t type;
    uint32_t r = get_random() % 100;
    if (r < 50) {
        type = 10; // ?????
    } else if (r < 80) {
        type = 20; // ????
    } else {
        type = 30; // ??????
    }

    uint16_t x = 40 + (get_random() % (FIELD_WIDTH - 80));   // 40..720
    uint16_t y = 40 + (get_random() % (FIELD_HEIGHT - 140)); // 40..460

    ships[free_slot].active = 1;
    ships[free_slot].type = type;
    ships[free_slot].x = x;
    ships[free_slot].y = y;

    log_to_buffer("SHIP:%d,%d,%d", type, x, y);
}
void check_ship_hit(uint16_t crosshair_x) {
    int hit = 0;
    uint8_t hit_type = 0;
    int hit_index = -1;

    for (int i = 0; i < MAX_SHIPS; i++) {
        if (ships[i].active) {
            if (crosshair_x >= ships[i].x - 30 && crosshair_x <= ships[i].x + 30) {
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

void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin){
    /*switch (GPIO_Pin) {
        case LEFT_BUTTON_Pin: 
            leftButtonHandler();	
            break;
            
        case MIDDLE_BUTTON_Pin: 
            middleButtonHandler();
            break;
            
        case RIGHT_BUTTON_Pin: 
            rightButtonHandler();
            break;
    } */
}


void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
}

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
    if (huart->Instance == USART2) {
        if (uart_rx_byte == '\n' || uart_rx_byte == '\r') {
            if (cmd_index > 0) {
                cmd_buffer[cmd_index] = '\0';
                cmd_ready = 1;
                cmd_index = 0;
            }
        } else {
            if (cmd_index < CMD_BUFFER_SIZE - 1) {
                cmd_buffer[cmd_index++] = uart_rx_byte;
            }
        }
        HAL_UART_Receive_IT(&huart2, (uint8_t*)&uart_rx_byte, 1);
    }
}

/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

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
	HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_SET);
	last_second_tick = HAL_GetTick();
	last_blink_tick = HAL_GetTick();
	HAL_UART_Receive_IT(&huart2, (uint8_t*)&uart_rx_byte, 1);
	/* USER CODE END 2 */
	
	for (int i = 0; i < 4; i++) {
			writeSegmentToDisplay(seg_nums[i], 0xFF);
	}
	HAL_Delay(10);
	HAL_TIM_Base_Start_IT(&htim2);
  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
/* USER CODE BEGIN WHILE */
	
	uint32_t last_button_check = 0;
	uint32_t last_second_tick = 0;
	uint32_t last_blink_tick = 0;
	while (1)
	{
			uint32_t current_time = HAL_GetTick(); 
			/* USER CODE END WHILE */

			// ????????? ?????
			if (log_pending) {
					process_logs();
			}

			// ????????? ??????
			if (cmd_ready) {
					cmd_ready = 0;
					char *cmd = (char*)cmd_buffer;
					if (cmd[0] == '\0') {
							memset((void*)cmd_buffer, 0, CMD_BUFFER_SIZE);
							continue;
					}

					if (strncmp(cmd, "CMD:START", 9) == 0) {
							if (!game_started) {
									game_time = 60;
									last_second_tick = current_time;
									last_blink_tick = current_time;
							}
							game_started = 1;
							game_paused = 0;
							
							crosshair_locked = 0;
							
							for (int i = 0; i < MAX_SHIPS; i++) {
									ships[i].active = 0;
							}
							last_ship_spawn = current_time;
							spawn_ship();
							log_to_buffer("COM: START=%d, PAUSE = %d", game_started, game_paused);
							log_to_buffer("TIME:%d", game_time); 
					}
					else if (strncmp(cmd, "CMD:PAUSE", 9) == 0) {
							game_started = 1;
							game_paused = 1;
							log_to_buffer("COM: START=%d, PAUSE = %d", game_started, game_paused);
					}
					else if (strncmp(cmd, "CMD:RESET", 9) == 0) {
							game_started = 0;
							game_paused = 0;
							game_time = 60;
						
							crosshair_locked = 0;
						
							for (int i = 0; i < MAX_SHIPS; i++) {
									ships[i].active = 0;
							}
							last_ship_spawn = current_time;
						
							middle_button_click_count = 0; 
							log_to_buffer("COM: reset = 1 (start = 0, paused = 0)");
							log_to_buffer("TIME:%d", game_time); 
					} 
					else {
							log_to_buffer("COM: unknown cmd: %s", cmd);
					}
					memset((void*)cmd_buffer, 0, CMD_BUFFER_SIZE);
			}
//____________________BUTTONS____________________________
			if (current_time - last_button_check >= 30) {
					last_button_check = current_time;

					uint8_t left_now = HAL_GPIO_ReadPin(LEFT_BUTTON_GPIO_Port, LEFT_BUTTON_Pin);
					if (left_button_prev == 1 && left_now == 0) {
							if (game_started && !game_paused && !crosshair_locked) {
									log_to_buffer("CROSSHAIR_STEP_LEFT");
							}
					}
					left_button_prev = left_now;

					uint8_t right_now = HAL_GPIO_ReadPin(RIGHT_BUTTON_GPIO_Port, RIGHT_BUTTON_Pin);
					if (right_button_prev == 1 && right_now == 0) {
							if (game_started && !game_paused && !crosshair_locked) {
									log_to_buffer("CROSSHAIR_STEP_RIGHT");
							}
					}
					right_button_prev = right_now;

					uint8_t middle_now = HAL_GPIO_ReadPin(MIDDLE_BUTTON_GPIO_Port, MIDDLE_BUTTON_Pin);
					if (middle_button_prev == 1 && middle_now == 0) {
							if (game_started && !game_paused) {
									if (!crosshair_locked) {
											crosshair_locked = 1;
											log_to_buffer("MIDDLE_CLICK_1");
									} else {
											crosshair_locked = 0;
											log_to_buffer("MIDDLE_CLICK_2");
									}
							}
					}
					middle_button_prev = middle_now;
			}
			
			if (game_started && !game_paused) {
					uint32_t now = HAL_GetTick();
					if (now - last_ship_spawn >= 2000) {
							last_ship_spawn = now;
							spawn_ship();
					}
			}
			
			if (game_started && !game_paused) {
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
					display_on = 1;
			}
			
			if (game_started && game_paused) {
					if (current_time - last_blink_tick >= 500) {
							last_blink_tick = current_time;
							display_on = !display_on;
					}
			}
			updateDisplay();

			//HAL_Delay(1);

			/* USER CODE BEGIN 3 */
	}
  /* USER CODE END 3 */
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
