/*
  AS7331 -> Serial: irradiancia en mW/cm2
  XIAO ESP32-C3: SDA=6, SCL=7

  Fórmula de conversión extraída de uvi-wifi-movil.ino (verificada con sensor certificado):
    raw = uvSensor.getUVA()  (valor raw del canal UVA)
    irr = raw / ((RESPONSIVITY_405NM / 2048.0) * 1.0 * 2.0 * 1000.0)

  NO usar getUVA()/1000 directamente — esa fórmula da valores incorrectos.
  NO cambiar GAIN_1 ni TIME_128MS — la calibración a 405nm fue verificada con estos parámetros.
*/

#include <Wire.h>
#include <SparkFun_AS7331.h>

SfeAS7331ArdI2C uvSensor;

#define PIN_SDA 6   // XIAO ESP32-C3 D4
#define PIN_SCL 7   // XIAO ESP32-C3 D5

// Factor de responsividad verificado experimentalmente a 405nm con sensor certificado
const float RESPONSIVITY_405NM = 429.4;

float currentTemp = NAN;
unsigned long lastTempMs = 0;

void setup() {
  Serial.begin(115200);
  delay(200);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);

  if (!uvSensor.begin(0x74, Wire)) {
    Serial.println("AS7331 FAIL");
    while (1) delay(1000);
  }

  // NO cambiar GAIN_1 ni TIME_128MS — calibración verificada con estos valores
  uvSensor.setGain(GAIN_1);
  uvSensor.setConversionTime(TIME_128MS);
  uvSensor.prepareMeasurement(MEAS_MODE_CONT);
  uvSensor.setStartState(true);

  uvSensor.readTemp();
  currentTemp = uvSensor.getTemp();
  lastTempMs = millis();
}

void loop() {
  if (uvSensor.readAllUV() == ksfTkErrOk) {
    float raw = (float)uvSensor.getUVA();

    // Fórmula de conversión verificada (igual que uvi-wifi-movil.ino)
    float irr_mWcm2 = raw / ((RESPONSIVITY_405NM / 2048.0) * 1.0 * 2.0 * 1000.0);
    if (irr_mWcm2 < 0.0001) irr_mWcm2 = 0;

    Serial.println(irr_mWcm2, 6);
  } else {
    Serial.println("nan");
  }

  // Temperatura en segundo plano cada 2s
  if (millis() - lastTempMs > 2000) {
    if (uvSensor.readTemp() == ksfTkErrOk) currentTemp = uvSensor.getTemp();
    lastTempMs = millis();
  }

  delay(50);  // ~6-7 muestras/s (conversión real tarda 128ms, delay no afecta medición)
}
