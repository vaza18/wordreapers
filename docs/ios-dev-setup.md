# iOS Simulator development (третій гравець для тестів)

Помилка **«No script URL provided»** / `unsanitizedScriptURLString = (null)` означає: застосунок **не знаходить Metro** (dev-сервер JavaScript на порту `8081`). На **фізичному iPhone** `localhost` — це сам телефон, тому потрібен IP Mac (`192.168.x.x`); скрипт `ios:device` прописує його в `Info.plist` (`EXMetroHost`) і `AppDelegate`.

## Швидкий старт (рекомендовано)

```bash
npm run ios
```

Expo покаже **інтерактивний список** — симулятор або підключений iPhone (як раніше).

Скрипт `scripts/run-ios.sh`:

1. перевіряє, чи Metro вже слухає `:8081` (якщо ні — піднімає у фоні);
2. запускає `expo run:ios --no-bundler` з вибором пристрою;
3. для **фізичного iPhone** після збірки вбудовує `main.jsbundle` і перевстановлює `.app`.

Прямо на телефон без меню: `npm run ios:device iPhone` (або legacy UDID з `xctrace`).

## Два термінали (стабільніше для довгих сесій)

**Термінал 1** — Metro (залишити відкритим):

```bash
npm start
```

**Термінал 2** — збірка / перезапуск у симуляторі:

```bash
npx expo run:ios --no-bundler
```

Або в інтерактивному Metro натисніть **`i`** — відкриє iOS Simulator без повної перезбірки.

## Кілька гравців (телефон + симулятор)

1. Телефони й симулятор мають бачити **той самий Metro** на Mac.
2. У Metro за замовчуванням використовується LAN-IP Mac (`192.168.x.x`). Симулятор підключається через `localhost:8081`.
3. Якщо телефон не бачить Metro — спробуйте:

```bash
npm run start:tunnel
```

4. Firebase / онлайн-гра працюють незалежно від Metro — головне, щоб кожен клієнт мав збірку з тим самим `gameId`.

## Перша збірка

Потрібні **Xcode** (з App Store) і **CocoaPods**:

```bash
cd ios && pod install && cd ..
npm run ios
```

Папка `ios/` генерується через `expo prebuild` / `expo run:ios` і **не комітиться** в git.

## `Cannot find native module 'ExpoPushTokenManager'`

Зʼявляється, якщо в JS додали `expo-notifications`, а **нативну iOS-збірку не перезбирали**. Потрібна повна перезбірка:

```bash
cd ios && pod install && cd ..
npm run ios
```

До перезбірки додаток має запускатися без крашу (сповіщення просто вимкнені), якщо Metro підключений.

## Якщо помилка лишається

1. Переконайтесь, що Metro живий: `curl http://127.0.0.1:8081/status` → `packager-status:running`.
2. У симуляторі: **⌘R** (Reload) або видаліть застосунок і знову `npm run ios`.
3. Після змін нативних залежностей (камера, notifications тощо) — повна перезбірка: `npm run ios`.
4. Перевірте `ios/.xcode.env.local` — `NODE_BINARY` має вказувати на ваш `node` (nvm).

## Фізичний iPhone (кабель / Wi‑Fi)

`npm run ios` — вибір **симулятора або iPhone** в меню Expo. `npm run ios:device iPhone` — одразу на телефон без меню.

### Чому «оновлення не доїхали» на телефон

1. **Вбудований JS на телефоні** — `ios:device` після збірки робить `export:embed` (`--dev false`), щоб уникнути помилки _«Cannot create devtools websocket connections in embedded environments»_. Додаток запускається **без Metro**. Для live reload потрібен Metro (LAN або tunnel) — тоді dev client завантажує JS з Mac, а не з `main.jsbundle`.
2. **Зібрали на симулятор, а не на телефон.** У логах має бути `Debug-iphoneos`, не `Debug-iphonesimulator`.
3. **Тільки JS змінився** — достатньо підключити Metro + reload (див. нижче), повна перезбірка не потрібна.
4. **Змінились нативні модулі** (camera, notifications тощо) — потрібна повна збірка на пристрій.
5. **Закешована збірка** — `npm run ios:device:fresh iPhone` (очищає native cache і перезбирає JS).

### Перша збірка на iPhone 13

**Термінал 1** — Metro (залишити відкритим):

```bash
npm start
```

(запускає Metro у режимі **development build**, не Expo Go)

Якщо телефон не в тій самій мережі, що Mac — `npm run start:tunnel`.

**Термінал 2** — збірка на **фізичний** пристрій. Потрібен **legacy UDID** з `xctrace`, не Identifier з `devicectl`:

```bash
xcrun xctrace list devices
# iPhone (18.5) (00008110-001474A93A12801E)  ← цей UDID

npm run ios:device 00008110-001474A93A12801E
# або за іменем:
npm run ios:device iPhone
```

Identifier з `devicectl list devices` (на кшталт `3225E6A8-…`) **не працює** з `expo run:ios`.

На iPhone: **Налаштування → Загальні → VPN і керування пристроєм** — довірити сертифікату розробника.

Після встановлення **обовʼязково** відкрийте Словозбирачі, поки Metro запущений, і дочекайтесь `iOS Bundled` у терміналі Metro. Скрипт `ios:device` прописує IP Mac у `ios/.xcode.env.local`, щоб телефон знаходив Metro в локальній мережі.

### Оновити лише JavaScript (без повної перезбірки)

1. Metro на Mac запущений (`npm start`).
2. iPhone і Mac в одній мережі (або tunnel).
3. Відкрити dev client **Wordreapers** на телефоні.
4. У терміналі Metro натиснути **`r`** (reload) або струснути телефон → Reload.

Якщо Metro пише **«No apps connected»**:

- У рядку статусу має бути **development build**, не **Expo Go** (у старому Metro натисніть **`s`** або перезапустіть `npm start`).
- Відкрити саме **Wordreapers** на телефоні (не Expo Go).
- iPhone і Mac в одній Wi‑Fi; інакше `npm run start:tunnel`.

### Повна перезбірка на телефон

Після `npm install`, нових native-пакетів або `expo prebuild`:

```bash
npm start
# інший термінал:
npm run ios:device <legacy-udid-з-xctrace>
```

Або з Metro в одній команді: `npm run ios:device:metro` (потрібен той самий `IOS_DEVICE_UDID` у скрипті — додайте вручну через `expo run:ios --device <udid>`).

### Push Notifications / provisioning profile (безкоштовний Apple ID)

Помилка на кшталт _«Personal development teams do not support the Push Notifications capability»_:

- Безкоштовний **Personal Team** не підписує збірки з `aps-environment`.
- У проєкті сповіщення **локальні** (раунд завершено), remote push не використовується.
- Скрипт `ios:device` прибирає `aps-environment` автоматично; після `expo prebuild` це робить плагін `without-ios-push-entitlement`.
- Якщо з’явиться платний Apple Developer Program і знадобиться remote push: `EXPO_IOS_ENABLE_PUSH=1 npm run ios:device …`.

### devicectl / пристрій не видно

```bash
xcrun devicectl list devices
```

Якщо попередження `Unexpected devicectl JSON version` — оновіть Xcode (App Store) і Command Line Tools. Телефон розблокуйте, підтвердіть «Довіряти цьому комп’ютеру».

## Порівняння з Android

|                | Android                    | iOS Simulator                                | iPhone (кабель)                        |
| -------------- | -------------------------- | -------------------------------------------- | -------------------------------------- |
| Команда        | `npm run android`          | `npm run ios`                                | `IOS_DEVICE_UDID=… npm run ios:device` |
| Metro          | Expo піднімає разом із run | Тримайте Metro окремо або через `run-ios.sh` | **Обовʼязково** `npm start` окремо     |
| Третій гравець | Другий телефон / емулятор  | Симулятор на Mac                             | Другий телефон                         |
