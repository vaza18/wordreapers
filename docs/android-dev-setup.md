# Android development build (перший `expo run:android`)

Помилка `Failed to resolve the Android SDK path` / `spawn adb ENOENT` означає: на Mac **немає Android SDK** (зазвичай ставиться разом з **Android Studio**).

## 1. Встановити Android Studio

1. Завантажте: https://developer.android.com/studio
2. Встановіть у **Applications** (стандартний інсталятор `.dmg`).
3. Запустіть Android Studio → **Setup Wizard** → **Standard** → дочекайтесь завантаження SDK.
4. Шлях за замовчуванням: `~/Library/Android/sdk`

## 2. SDK у SDK Manager

**Android Studio → Settings → Languages & Frameworks → Android SDK**

Вкладка **SDK Platforms** (мінімум одна):

- **Android 14 (API 34)** або **Android 15 (API 35)** — увімкніть галочку

Вкладка **SDK Tools**:

- Android SDK Build-Tools
- Android SDK Platform-Tools (`adb`)
- Android SDK Command-line Tools
- NDK (опційно; Expo може підтягнути сам)

Натисніть **Apply** і дочекайтесь установки.

## 3. Java (JDK) — обовʼязково для Gradle

Помилка **`Unable to locate a Java Runtime`** означає, що `JAVA_HOME` не вказаний. JDK уже є **всередині Android Studio** (JBR), окремо Java з java.com ставити не потрібно.

Додайте в `~/.zshrc` (разом із Android SDK):

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/emulator
```

Потім:

```bash
source ~/.zshrc
java -version
adb version
```

Або **без зміни `.zshrc`** — збирайте через скрипт проєкту (підставляє шляхи сам):

```bash
npm run android
```

## 4. Змінні середовища (перевірка)

```bash
npm run android:check
```

Має бути: `JAVA_HOME=.../jbr/...`, `adb version`, `Android Studio: installed`.

## 5. Телефон або емулятор

### Фізичний Android (рекомендовано)

1. **Налаштування → Про телефон** → 7× натиснути «Номер збірки» → режим розробника.
2. **Для розробників** → **Налагодження USB** увімк.
3. Підключіть USB, на телефоні дозвольте налагодження.
4. `adb devices` — має з’явитися пристрій `device`.

### Емулятор

Android Studio → **Device Manager** → **Create Device** → завантажте system image → **Run**.

## 6. Збірка Wordreapers

У папці проєкту:

```bash
cd wordreapers
npm run dict:all          # якщо ще не робили
npm run android           # або: source scripts/android-env.sh && npx expo run:android
```

Перша збірка — **10–20 хв** (Gradle, залежності). Далі швидше.

На телефон встановиться **окремий** застосунок «Словозбирачі» (не Expo Go). Там має працювати прихований статус-бар.

## 7. Після змін у `app.json` / нативних плагінах

```bash
npx expo prebuild --clean
npx expo run:android
```

## Типові проблеми

| Симптом                           | Що зробити                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Unable to locate a Java Runtime` | Додати `JAVA_HOME` (JBR з Android Studio) → крок 3                                                    |
| `Unable to activate keep awake`   | Пакет `expo-keep-awake` у проєкті; після `npm install` — **перезібрати** dev build: `npm run android` |
| `adb ENOENT`                      | Немає `platform-tools` або не оновлено `PATH` → крок 3–4                                              |
| `No devices`                      | USB / емулятор → крок 4, `adb devices`                                                                |
| JDK помилка                       | Android Studio → **Settings → Build → Gradle JDK** → Embedded JDK 17                                  |
| Повільна збірка                   | Нормально для першого разу; наступні — інкрементальні                                                 |

## Expo Go vs dev build

|                       | Expo Go                      | `expo run:android` |
| --------------------- | ---------------------------- | ------------------ |
| Встановлення          | Play Store                   | Збираєте ви        |
| Статус-бар (годинник) | Завжди видно (оболонка Expo) | Можна сховати      |
| Словник / гра         | Так                          | Так                |

Для сімейного тесту з повним екраном — **dev build**; для швидких правок UI — **Expo Go + tunnel**.
