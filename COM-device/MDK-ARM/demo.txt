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
#define DEBOUNCE_DELAY 50 

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */
uint32_t left_button_last_time = 0;
uint32_t middle_button_last_time = 0;
uint32_t right_button_last_time = 0;

uint8_t disp_buf[4] = {0xFF, 0xFF, 0xFF, 0xFF};
uint8_t seg_nums[4] = {0xF8, 0xF4, 0xF2, 0xF1};
uint8_t seg_digits[10] = {0xC0, 0xF9, 0xA4, 0xB0, 0x99, 
													0x92, 0x82, 0xF8, 0x80, 0x90};

uint8_t seg_minus = 0x40;   
uint8_t seg_dot = 0x80; 

uint32_t last_signal_update = 0;
uint32_t update_interval = 10;
													
volatile uint8_t signal_active = 0;
volatile float current_signal_value = 0.0f;
volatile uint32_t last_update_time = 0;				
volatile uint8_t amplitude_level = 1;		
volatile float additional_signals = 0.0f;
volatile uint8_t active_additional_signals = 0;		
volatile float combined_signal = 0;													
volatile uint8_t logging_enabled = 1;
char log_buffer[128];													
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
/* USER CODE BEGIN PFP */
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

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

void log_signal_data(float main_signal, float random_signal, float combined, uint8_t amplitude, uint8_t extra_signals) {
    log_message("SIG:%.3f,%.3f,%.3f,%d,%d", 
                main_signal, random_signal, combined, amplitude, extra_signals);
}

void log_string(const char* message) {
    log_message("%s", message);
}
/* USER CODE END PFP */												
												
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
float generateSignal(uint32_t time_ms) {
    float frequency = 0.5f; 
    float amplitude = (float)amplitude_level; 
    return amplitude * sin(2.0f * PI * frequency * (time_ms / 1000.0f));
}
float generateRandomSignal(uint32_t time_ms, uint8_t signal_id) {
    uint32_t seed = time_ms + signal_id * 12345;
    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
    float freq_random = (seed % 100) / 100.0f;
    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
    float amp_random = (seed % 100) / 100.0f;
    float frequency = 0.5f + freq_random * 1.5f;
    float amplitude = amp_random * 3.0f;
    return amplitude * sin(2.0f * PI * frequency * (time_ms / 1000.0f));
}

void leftButtonHandler(){
    if (!signal_active) {
        signal_active = 1;
        last_update_time = HAL_GetTick();
        amplitude_level = 1;
        active_additional_signals = 0; 
				log_string("SIGNAL_START");
    } else {
        signal_active = 0;
        current_signal_value = 0.0f;
        displayFloatNumber(0.0f); 
				if (active_additional_signals) log_string("SIGNAL_STOP - RAND");
				log_string("SIGNAL_STOP");
    }
}
void middleButtonHandler(){
		if (signal_active) {
				amplitude_level++;
				if(amplitude_level > 3) {
						amplitude_level = 1;
				}
				log_message("AMPLITUDE_CHANGED:%d", amplitude_level);
		}
}
void rightButtonHandler(){
    if (signal_active) {
        active_additional_signals = (active_additional_signals == 0) ? 1 : 0;
				if (active_additional_signals) log_string("SIGNAL_START - RAND");
				else log_string("SIGNAL_STOP - RAND");
    }
}
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin){
    uint32_t current_time = HAL_GetTick();
    
    switch (GPIO_Pin) {
        case LEFT_BUTTON_Pin: 
            if (current_time - left_button_last_time > DEBOUNCE_DELAY) {
                left_button_last_time = current_time;
                leftButtonHandler();	
            }
            break;
            
        case MIDDLE_BUTTON_Pin: 
            if (current_time - middle_button_last_time > DEBOUNCE_DELAY) {
                middle_button_last_time = current_time;
                middleButtonHandler();
            }
            break;
            
        case RIGHT_BUTTON_Pin: 
            if (current_time - right_button_last_time > DEBOUNCE_DELAY) {
                right_button_last_time = current_time;
                rightButtonHandler();
            }
            break;
    }
}
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
    static uint32_t counter = 0;
    if (htim->Instance == TIM2) {
        if (signal_active) {
            uint32_t current_time = HAL_GetTick();
            current_signal_value = generateSignal(current_time);
            float combined_signal = current_signal_value;
            if(active_additional_signals > 0) {
                additional_signals = generateRandomSignal(current_time, 0);
                combined_signal += additional_signals;
            }            
            displayFloatNumber(combined_signal);
						
						log_signal_data(current_signal_value, 
                           additional_signals, 
                           combined_signal,
                           amplitude_level,
                           active_additional_signals);
        }
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
	// USER CODE BEGIN 2

	seg_minus = ~seg_minus;
	seg_dot = ~seg_dot;

  /* USER CODE END 2 */
	HAL_TIM_Base_Start_IT(&htim2);
  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
	while (1)
    {
        for (int i = 0; i < 4; i++) {
						writeSegmentToDisplay(seg_nums[signal_active ? i : 0], 
																	disp_buf[signal_active ? i : 0]);
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
