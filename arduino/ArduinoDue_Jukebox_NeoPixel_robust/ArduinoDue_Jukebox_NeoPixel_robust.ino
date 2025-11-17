/*
  Arduino Due Jukebox NeoPixel receiver - ROBUST VERSION
  Uses lower baud rate and better buffering to handle Windows USB CDC.
*/

#include <Adafruit_NeoPixel.h>

#define STRIP_COUNT 4
static const uint16_t SEGMENTS[STRIP_COUNT] = {150, 300, 300, 300};
static const uint8_t  DATA_PINS[STRIP_COUNT] = {6, 7, 8, 9};
static const uint8_t  COLOR_ORDER = NEO_GRB;
// Use 115200 for broad compatibility with Windows USB-serial drivers. If you
// need higher speed, change this value and ensure the bridge uses the same baud.
static const uint32_t SERIAL_BAUD = 115200UL;
static const uint8_t HDR_0 = 0xAA;
static const uint8_t HDR_1 = 0x55;

static const uint16_t TOTAL_LEDS = SEGMENTS[0] + SEGMENTS[1] + SEGMENTS[2] + SEGMENTS[3];

Adafruit_NeoPixel strips[STRIP_COUNT] = {
  Adafruit_NeoPixel(SEGMENTS[0], DATA_PINS[0], COLOR_ORDER + NEO_KHZ800),
  Adafruit_NeoPixel(SEGMENTS[1], DATA_PINS[1], COLOR_ORDER + NEO_KHZ800),
  Adafruit_NeoPixel(SEGMENTS[2], DATA_PINS[2], COLOR_ORDER + NEO_KHZ800),
  Adafruit_NeoPixel(SEGMENTS[3], DATA_PINS[3], COLOR_ORDER + NEO_KHZ800)
};

static uint16_t offsets[STRIP_COUNT];

// Circular buffer for incoming serial data
#define RX_BUFFER_SIZE 4096
static uint8_t rx_buffer[RX_BUFFER_SIZE];
static uint16_t rx_head = 0;
static uint16_t rx_tail = 0;

// Frame state
enum RxState { WAIT_HDR0, WAIT_HDR1, WAIT_LEN_LO, WAIT_LEN_HI, READ_PAYLOAD, WAIT_CSUM_LO, WAIT_CSUM_HI };
static RxState rxState = WAIT_HDR0;
static uint16_t frame_leds = 0;
static uint32_t payload_expected = 0;
static uint16_t checksum_calc = 0;
static uint16_t checksum_recv = 0;
static uint32_t payload_index = 0;
static uint8_t r_cur=0, g_cur=0, b_cur=0;
static uint32_t last_heartbeat = 0;

inline void setGlobalPixel(uint16_t idx, uint8_t r, uint8_t g, uint8_t b) {
  if (idx >= TOTAL_LEDS) return;
  uint8_t sid = 0;
  for (uint8_t i = 0; i < STRIP_COUNT - 1; i++) {
    if (idx >= offsets[i + 1]) sid = i + 1;
  }
  uint16_t local = idx - offsets[sid];
  strips[sid].setPixelColor(local, strips[sid].Color(r, g, b));
}

// Fill the RX circular buffer from all available serial interfaces
void rx_fill() {
  // Read from primary USB serial (Programming port)
  while (Serial.available() > 0) {
    uint8_t b = Serial.read();
    uint16_t next = (rx_head + 1) % RX_BUFFER_SIZE;
    if (next != rx_tail) {  // Only add if buffer not full
      rx_buffer[rx_head] = b;
      rx_head = next;
    }
  }
#if defined(SerialUSB)
  // Also read from native USB if present
  while (SerialUSB.available() > 0) {
    uint8_t b = SerialUSB.read();
    uint16_t next = (rx_head + 1) % RX_BUFFER_SIZE;
    if (next != rx_tail) {
      rx_buffer[rx_head] = b;
      rx_head = next;
    }
  }
#endif
}

// Try to read one byte from buffer
static bool rx_read(uint8_t& b) {
  if (rx_tail == rx_head) return false;  // Buffer empty
  b = rx_buffer[rx_tail];
  rx_tail = (rx_tail + 1) % RX_BUFFER_SIZE;
  return true;
}

void flash_startup() {
  uint32_t colors[4] = {strips[0].Color(64,0,0), strips[1].Color(0,64,0), strips[2].Color(0,0,64), strips[3].Color(64,64,0)};
  for (uint8_t s = 0; s < STRIP_COUNT; s++) {
    for (uint16_t i = 0; i < SEGMENTS[s]; i++) strips[s].setPixelColor(i, colors[s]);
    strips[s].show();
    delay(250);
    for (uint16_t i = 0; i < SEGMENTS[s]; i++) strips[s].setPixelColor(i, 0);
    strips[s].show();
  }
}

void report_info() {
  Serial.println("Arduino Due Jukebox NeoPixel ROBUST Ready");
  Serial.print("TOTAL_LEDS="); Serial.println(TOTAL_LEDS);
  Serial.print("STRIP_SEGMENTS=");
  for (uint8_t i = 0; i < STRIP_COUNT; i++) {
    Serial.print(SEGMENTS[i]); if (i < STRIP_COUNT-1) Serial.print(",");
  }
  Serial.println();
  Serial.print("DATA_PINS=");
  for (uint8_t i = 0; i < STRIP_COUNT; i++) {
    Serial.print((int)DATA_PINS[i]); if (i < STRIP_COUNT-1) Serial.print(",");
  }
  Serial.println();
  // Also mirror to native USB if available so host can listen on either port
#if defined(SerialUSB)
  SerialUSB.println("Arduino Due Jukebox NeoPixel ROBUST Ready");
  SerialUSB.print("TOTAL_LEDS="); SerialUSB.println(TOTAL_LEDS);
  SerialUSB.print("STRIP_SEGMENTS=");
  for (uint8_t i = 0; i < STRIP_COUNT; i++) {
    SerialUSB.print(SEGMENTS[i]); if (i < STRIP_COUNT-1) SerialUSB.print(",");
  }
  SerialUSB.println();
  SerialUSB.print("DATA_PINS=");
  for (uint8_t i = 0; i < STRIP_COUNT; i++) {
    SerialUSB.print((int)DATA_PINS[i]); if (i < STRIP_COUNT-1) SerialUSB.print(",");
  }
  SerialUSB.println();
  SerialUSB.flush();
#endif
  Serial.flush();  // Ensure startup messages are sent immediately
}

void setup() {
  offsets[0] = 0;
  for (uint8_t i = 1; i < STRIP_COUNT; i++) offsets[i] = offsets[i-1] + SEGMENTS[i-1];

  for (uint8_t i = 0; i < STRIP_COUNT; i++) {
    strips[i].begin();
    strips[i].show();
    strips[i].setBrightness(255);
  }

  // Heartbeat LED on board (toggle to show sketch is running)
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  Serial.begin(SERIAL_BAUD);
  // Also start native USB if present so host may listen on either interface
#if defined(SerialUSB)
  SerialUSB.begin(SERIAL_BAUD);
#endif
  // Don't wait indefinitely for serial on Due - timeout after 2 seconds and proceed
  // This allows the sketch to run even if no serial monitor is connected
  uint32_t start = millis();
  while (!Serial && (millis() - start) < 2000) {
    delay(10);
  }

  report_info();
  flash_startup();
}

void loop() {
  uint8_t b;
  // Periodic heartbeat so host can confirm sketch is running even if no serial
  uint32_t now = millis();
  if ((now - last_heartbeat) > 2000) {
    last_heartbeat = now;
    Serial.println("[Arduino] Alive");
#if defined(SerialUSB)
    SerialUSB.println("[Arduino] Alive");
#endif
    // Toggle on-board LED
    digitalWrite(LED_BUILTIN, (digitalRead(LED_BUILTIN) == LOW) ? HIGH : LOW);
  }

  // Fill buffer from available serial ports (programming + native)
  rx_fill();
  while (rx_read(b)) {
    switch (rxState) {
      case WAIT_HDR0:
        if (b == HDR_0) rxState = WAIT_HDR1;
        break;
      case WAIT_HDR1:
        if (b == HDR_1) rxState = WAIT_LEN_LO; else rxState = WAIT_HDR0;
        break;
      case WAIT_LEN_LO:
        frame_leds = b;
        rxState = WAIT_LEN_HI;
        break;
      case WAIT_LEN_HI:
        frame_leds |= (uint16_t)b << 8;
        payload_expected = (uint32_t)frame_leds * 3UL;
        payload_index = 0;
        checksum_calc = 0;
  Serial.print("[Arduino] Frame start: leds="); Serial.print(frame_leds);
  Serial.print(" payload_bytes="); Serial.println(payload_expected);
#if defined(SerialUSB)
  SerialUSB.print("[Arduino] Frame start: leds="); SerialUSB.print(frame_leds);
  SerialUSB.print(" payload_bytes="); SerialUSB.println(payload_expected);
#endif
        rxState = (payload_expected > 0) ? READ_PAYLOAD : WAIT_CSUM_LO;
        break;
      case READ_PAYLOAD: {
        checksum_calc = (checksum_calc + b) & 0xFFFF;
        uint8_t comp = payload_index % 3;
        if (comp == 0) r_cur = b;
        else if (comp == 1) g_cur = b;
        else {
          b_cur = b;
          uint16_t ledIdx = payload_index / 3;
          setGlobalPixel(ledIdx, r_cur, g_cur, b_cur);
          if (ledIdx < 5) {
            Serial.print("  pixel "); Serial.print(ledIdx); Serial.print(" RGB=");
            Serial.print(r_cur); Serial.print(","); Serial.print(g_cur); Serial.print(","); Serial.println(b_cur);
#if defined(SerialUSB)
            SerialUSB.print("  pixel "); SerialUSB.print(ledIdx); SerialUSB.print(" RGB=");
            SerialUSB.print(r_cur); SerialUSB.print(","); SerialUSB.print(g_cur); SerialUSB.print(","); SerialUSB.println(b_cur);
#endif
          }
        }
        payload_index++;
        if (payload_index >= payload_expected) rxState = WAIT_CSUM_LO;
        break;
      }
      case WAIT_CSUM_LO:
        checksum_recv = b;
        rxState = WAIT_CSUM_HI;
        break;
      case WAIT_CSUM_HI:
        checksum_recv |= (uint16_t)b << 8;
        Serial.print("[Arduino] Checksum calc="); Serial.print(checksum_calc);
        Serial.print(" recv="); Serial.println(checksum_recv);
#if defined(SerialUSB)
        SerialUSB.print("[Arduino] Checksum calc="); SerialUSB.print(checksum_calc);
        SerialUSB.print(" recv="); SerialUSB.println(checksum_recv);
#endif
        if (checksum_recv == checksum_calc) {
          for (uint8_t i = 0; i < STRIP_COUNT; i++) strips[i].show();
          Serial.println("[Arduino] ✓ Frame OK: showed LEDs");
#if defined(SerialUSB)
          SerialUSB.println("[Arduino] ✓ Frame OK: showed LEDs");
          SerialUSB.flush();
#endif
          Serial.flush();  // Ensure frame confirmation is sent
        } else {
          Serial.print("[Arduino] ✗ Checksum error: exp="); Serial.print(checksum_calc);
          Serial.print(" got="); Serial.println(checksum_recv);
#if defined(SerialUSB)
          SerialUSB.print("[Arduino] ✗ Checksum error: exp="); SerialUSB.print(checksum_calc);
          SerialUSB.print(" got="); SerialUSB.println(checksum_recv);
          SerialUSB.flush();
#endif
          Serial.flush();  // Ensure error is sent
        }
        rxState = WAIT_HDR0;
        break;
    }
  }
}
