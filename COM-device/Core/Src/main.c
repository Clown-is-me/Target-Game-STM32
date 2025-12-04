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

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */
/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

#define PI 3.14159f
#define DEBOUNCE_DELAY 200
#define LOG_BUFFER_SIZE 256

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */
char log_ring_buffer[LOG_BUFFER_SIZE];
volatile uint16_t log_write_idx = 0;
volatile uint16_t log_read_idx = 0;
volatile uint8_t log_pending = 0;

uint8_t disp_buf[4] = {0xFF, 0xFF, 0xFF, 0xFF};
uint8_t seg_nums[4] = {0xF8, 0xF4, 0xF2, 0xF1};
uint8_t seg_digits[10] = {0xC0, 0xF9, 0xA4, 0xB0, 0x99, 
													0x92, 0x82, 0xF8, 0x80, 0x90};

uint8_t seg_minus = 0x40;   
uint8_t seg_dot = 0x80; 											
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


void leftButtonHandler(){
		uint32_t current_time = HAL_GetTick();
    
    if (current_time - button_left_last_time > DEBOUNCE_DELAY) {
        button_left_last_time = current_time;
        
        if (HAL_GPIO_ReadPin(LEFT_BUTTON_GPIO_Port, LEFT_BUTTON_Pin) == GPIO_PIN_SET) {
            // ?????? ????????
            button_left_state = 0;
            log_to_buffer("LEFT_RELEASE");
        } else {
            // ?????? ??????
            button_left_state = 1;
            log_to_buffer("LEFT_PRESS");
        }
    }
}
void middleButtonHandler(){
		uint32_t current_time = HAL_GetTick();
    
    if (current_time - button_middle_last_time > DEBOUNCE_DELAY) {
        button_middle_last_time = current_time;
        
        if (HAL_GPIO_ReadPin(MIDDLE_BUTTON_GPIO_Port, MIDDLE_BUTTON_Pin) == GPIO_PIN_SET) {
            // ?????? ????????
            button_middle_state = 0;
            
            // ??????? ??????
            middle_button_click_count++;
            
            if (middle_button_click_count == 1) {
                // ?????? ???? - ????????
                crosshair_locked = 1;
                log_to_buffer("MIDDLE_CLICK_1");
            } else if (middle_button_click_count == 2) {
                // ?????? ???? - ???????
                log_to_buffer("MIDDLE_CLICK_2");
                middle_button_click_count = 0;
                crosshair_locked = 0;
            }
        } else {
            // ?????? ??????
            button_middle_state = 1;
        }
    }
}

void rightButtonHandler(){
		uint32_t current_time = HAL_GetTick();
    
    if (current_time - button_right_last_time > DEBOUNCE_DELAY) {
        button_right_last_time = current_time;
        
        if (HAL_GPIO_ReadPin(RIGHT_BUTTON_GPIO_Port, RIGHT_BUTTON_Pin) == GPIO_PIN_SET) {
            // ?????? ????????
            button_right_state = 0;
            log_to_buffer("RIGHT_RELEASE");
        } else {
            // ?????? ??????
            button_right_state = 1;
            log_to_buffer("RIGHT_PRESS");
        }
    }
}
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin){
    switch (GPIO_Pin) {
        case LEFT_BUTTON_Pin: 
            leftButtonHandler();	
            break;
            
        case MIDDLE_BUTTON_Pin: 
            middleButtonHandler();
            break;
            
        case RIGHT_BUTTON_Pin: 
            rightButtonHandler();
            break;
    }
}


void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
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
	// USER CODE BEGIN 2

	seg_minus = ~seg_minus;
	seg_dot = ~seg_dot;

  /* USER CODE END 2 */
	HAL_TIM_Base_Start_IT(&htim2);
  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
	while (1)
    {
        /* USER CODE END WHILE */
				if (log_pending) {
						process_logs();
				}
				HAL_Delay(1);
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
