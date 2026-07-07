# Онлайн-мультиплеєр: узгоджені правила логіки

> Доповнення до [`slovozbyrachy_tz.md`](./slovozbyrachy_tz.md).  
> Описує поведінку кімнати, раундів, rematch, присутності та голосувань — узгоджено під час розробки (червень 2026).

## Діаграма станів кімнати

```mermaid
stateDiagram-v2
  direction LR
  [*] --> WaitingR0: create_room
  WaitingR0 --> Playing: start_round
  Playing --> Finished: timer_or_vote
  Finished --> WaitingR1: opt_in_rematch
  Finished --> FrozenView: not_opt_in
  WaitingR1 --> Playing: start_round
  Playing --> FrozenView: live_advances_while_viewing_prior
  WaitingR0 --> Home: back_from_lobby
  WaitingR1 --> Home: back_from_lobby
  FrozenView --> WaitingR1: play_again
  FrozenView --> FrozenView: review_prior_round
```

**Opt-in:** лише гравці з «Грати ще» або `online: true` у rematch `waiting` переходять у наступний `playing`. **Non-opt-in** залишаються на замороженому play/results (`FrozenView`), навіть коли RTDB уже `waiting`/`playing` наступного раунду.

---

## 1. Участь у раунді (opt-in)

| Правило                          | Деталі                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rematch лише за згодою**       | Наступний раунд у тій самій кімнаті починається лише для гравців, які явно натиснули **«Грати ще»** на екрані результатів (або приєднались до `waiting` після цього).                                                                |
| **Хто вважається opt-in**        | Гравець, який ініціював rematch (`actorUid`), або той, у кого в `resultsExitedBy[uid] === true` до переходу `finished → waiting`.                                                                                                    |
| **Після rematch**                | `resultsExitedBy` скидається. Opt-in учасники мають `online: true`; інші — `online: false`, `hasLeft: false` (залишаються в roster для історії, але **не в лобі**).                                                                  |
| **Перегляд попереднього раунду** | Гравець, який **не** натиснув «Грати ще», залишається на **замороженому** ігровому екрані або результатах **свого** раунду. RTDB може вже показувати `waiting` / `playing` наступного раунду — UI **не** перемикає його автоматично. |
| **Локальний знімок**             | Слова та стан завершеного раунду на play-екрані **заморожуються локально**; очищення RTDB при rematch не повинно спустошувати UI у гравця, що лишився на попередньому раунді.                                                        |

---

## 2. Навігація та вихід

| Правило                       | Деталі                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **«Назад» з лобі**            | **Усі** гравці (організатор, обирач слова, звичайний учасник) йдуть на **головний екран** через `exitOnlineToHome`.                                                                                                                                                |
| **Налаштування гри**          | Окремий шлях: кнопка **«Налаштувати гру»** (перший раунд без базового слова), **не** кнопка «Назад».                                                                                                                                                               |
| **Організатор і кімната**     | Організатор може піти з `waiting`; кімната **залишається**, якщо є інші гравці, які можуть продовжити (rematch / picker). Видалення — лише коли ніхто не може продовжити (`shouldOrganizerAbandonWaitingRoom`).                                                    |
| **Play → lobby**              | Якщо play відкрито при `status === 'waiting'` і гравець **не** на замороженому попередньому раунді — редірект на лобі. Non-opt-in у rematch waiting — редірект на frozen results (`useLiveRoundLobbyScreen`).                                                      |
| **Setup → lobby**             | Організатор на `setup?from=lobby`: коли раунд уже `playing`, редірект у лобі (далі auto-join у гру за правилами opt-in).                                                                                                                                           |
| **«Грати ще» (results)**      | Після дії — **свіжий** read RTDB (`optIntoLiveRound`): відсутній root або `finished` → rematch/bootstrap з архіву; потім завжди `rejoinExistingPlayer` + `markPlayerOnline` для `waiting`/`playing`; маршрут за `resolvePostJoinRoute` (lobby / pick-word / play). |
| **Presence на results**       | `markPlayerOffline` лише для поточного finished-перегляду; **не** при frozen попередньому раунді, коли live вже `playing`.                                                                                                                                         |
| **Play → play (новий раунд)** | Автоперехід / `rejoinExistingPlayer` — **лише** якщо гравець **активний учасник поточного `playing`** раунду, а не переглядає попередній (`isReviewingPriorRoundOnPlayScreen`).                                                                                    |
| **Left → results**            | «Переглянути результати» лишається після завершення раунду, навіть коли інший гравець уже відкрив rematch (`waiting` / `playing` наступного раунду); маршрут і **вміст** екрана прив’язані до `leftAtBaseWordRound`, не до «останнього» локального архіву.         |

---

## 3. Лобі rematch (раунд 2+)

| Правило                | Деталі                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Видимість у списку** | У `waiting` з `baseWordRound > 0` у списку гравців показуються **лише** `online: true` (opt-in).                                                                                                                                                                                           |
| **Лічильник гравців**  | Відповідає видимому списку, не всьому roster.                                                                                                                                                                                                                                              |
| **Старт раунду**       | `startGameSession` скидає `score`/`wordCount`: у лобі (`online: true`) — повний reset + `hasLeft: false`; у offline **opt-in** (`resultsExitedBy[uid]`) — те саме; інші offline — `online: false` + очищення лічильників. Записує `liveRoundPlayerUids` = uids з `online: true` у waiting. |

---

## 4. Обирач базового слова

| Правило                             | Деталі                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Раунд 1 (`baseWordRound === 0`)** | Перший **eligible** у черзі приєднання (`baseWordPickerOrder`).                                                          |
| **Раунд 2+**                        | Інший **online** гравець, коли в лобі **2+** eligible; повтор попереднього обирача — **лише** коли в лобі один eligible. |
| **Eligible**                        | `online === true`, `hasLeft !== true`.                                                                                   |
| **Rematch waiting**                 | Офлайн гравці з roster **не** беруть участь у ротації, навіть якщо `hasLeft === false`.                                  |
| **RTDB**                            | `baseWordPickerUid` синхронізується з `currentBaseWordPickerUid()` (`syncLobbyPickerState`).                             |
| **Старт гри**                       | Стартувати може **поточний обирач** (`canActorStartWaitingRound`), не лише організатор.                                  |

---

## 5. Активний учасник live-раунду

```text
isActiveLivePlayer(session, uid) :=
  session.status === 'playing'
  AND players[uid] існує
  AND players[uid].online === true
  AND NOT (players[uid].hasLeft === true AND players[uid].online !== true)
  AND (baseWordRound === 0 OR uid ∈ session.liveRoundPlayerUids)
```

**Stale `hasLeft`:** якщо `online === true`, гравець вважається active навіть коли `hasLeft` не встиг скинутись після rejoin. Справжній вихід — `hasLeft === true` **і** `online === false`.

**`liveRoundPlayerUids`:** при старті `waiting → playing` — uids з `online: true` у лобі; при mid-round rejoin (`rejoinExistingPlayer`) uid додається. Для `baseWordRound > 0` порожній/`null` список означає «ніхто не в раунді» (strict, без fallback). Гравець на results попереднього раунду **не** в списку → не active, не голосує.

| Використання                                   |                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| Маршрутизація play / lobby / results           | Так                                                                  |
| Голосування (завершити / пауза / час / resume) | **Обов'язково** — голосують лише active учасники поточного `playing` |
| `rejoinExistingPlayer` на play-екрані          | **Заборонено**, якщо гравець переглядає попередній раунд             |

Гравець на екрані раунду N з `live.baseWordRound > N` після rematch **не** повинен викликати `markPlayerOnline` / `rejoinExistingPlayer` для раунду N+1.

---

## 6. Голосування під час `playing`

| Тип                   | Хто повинен голосувати                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| Дострокове завершення | Усі **active** суперники (не proposer), `online === true` у поточному раунді |
| Пауза                 | Те саме                                                                      |
| Додатковий час        | Те саме                                                                      |
| Resume після паузи    | Те саме                                                                      |

| Тип                                                    | Хто **не** голосує                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Proposer                                               | Автоматично «за»                                                                      |
| `hasLeft === true`                                     | Не в раунді                                                                           |
| `online === false`                                     | Не в поточному live-раунді (переглядає минулий раунд, не натиснув «Грати ще», вийшов) |
| Гравець з минулого раунду на замороженому play/results | Навіть якщо в roster                                                                  |

**Таймаут** (30 с): якщо жоден required не відхилив — раунд завершується / голос застосовується.

**Соло в раунді** (`!hasOnlineOpponent` серед active): організатор завершує / ставить на паузу без голосування.

---

## 7. Присутність (`online`)

| Правило                       | Деталі                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Після `finished`**          | Play-екран викликає `markPlayerOffline` для перегляду результатів без live-присутності в наступному раунді.                                                   |
| **Results + live `playing`**  | Якщо `frozenRound < liveRound` — **`markPlayerOffline`** (перегляд попереднього раунду, не в live). Якщо frozen = live — offline не ставиться.                |
| **Відправка слова**           | Транзакції score/wordCount **не** змінюють `online` / `hasLeft` (presence окремо через rejoin / presence hook).                                               |
| **Toast `player_joined`**     | Лише коли гравець стає **active** у live-raунді (`online` + `liveRoundPlayerUids`). Зміна `hasLeft`/roster без opt-in — без toast.                            |
| **`alone_in_game`**           | Не спрацьовує, якщо в той самий diff хтось увійшов у live-raунд. Offline зі score без `liveRoundPlayerUids` не рахується учасником.                           |
| **Новий `playing`**           | `usePlayerOnlinePresence` увімкнено лише для active учасника (`!roundEnded` на **своєму** live-раунді).                                                       |
| **Вимкнення presence**        | При зміні `enabled` **не** ставити `offline` (лише `cancelOnDisconnect`). Offline — через `exitOnlineToHome` / `leaveGameSession` / `markPlayerOffline` явно. |
| **Перегляд старішого раунду** | На play при `liveRound > frozenRound` — `markPlayerOffline` навіть коли RTDB уже `playing`; на results — те саме.                                             |

---

## 8. Результати та архів

| Правило                         | Деталі                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Заморожений раунд**           | `shouldKeepFrozenResultsOverLiveFinished` — не підміняти UI, якщо live вже на новішому `baseWordRound`.         |
| **Відновлення з архіву**        | `shouldRecoverFinishedRoundFromArchive` — коли live `waiting` / `playing`, а гравець дивиться старі результати. |
| **Спільні слова на early exit** | Не приховувати співавторів на results — вони вже видимі на play-екрані (`mask-results-for-viewer`).             |

---

## 9. Помилки замість зависання

| Ситуація                         | Очікувана поведінка                                      |
| -------------------------------- | -------------------------------------------------------- |
| Late join у lobby не вдався      | Повідомлення `errorJoinFailed`                           |
| Play без session / rejoin failed | Текст помилки + кнопка «Головна», не нескінченний спінер |
| Старт раунду без слова           | `errorBaseWordMissing` / `errorStartFailed`              |

---

## 10. Firebase / правила

| Правило                          | Деталі                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Старт раунду**                 | RTDB: `baseWordPickerUid` має збігатися з клієнтським `currentBaseWordPickerUid()`. `liveRoundPlayerUids` — хто в live-раунді. |
| **Rematch `finished → waiting`** | Оновлення гравців через `rematchWaitingPlayerPatch`; non-opt-in не отримують `online: true`.                                   |
| **Orphan shell**                 | Читання для гравця з roster, якщо сесію видалено частково.                                                                     |

---

## 11. Матриця екранів (коротко)

```text
                    │ waiting (r0) │ waiting (r1+) │ playing (my round) │ playing (other round) │ finished (my view)
────────────────────┼──────────────┼───────────────┼────────────────────┼───────────────────────┼───────────────────
Opt-in rematch      │ lobby/setup  │ lobby         │ play               │ frozen play/results   │ results → Play again
Not opt-in          │ lobby/join   │ NOT in lobby  │ frozen play        │ frozen play/results   │ results (frozen)
Back from lobby     │ home (all)   │ home (all)    │ —                  │ —                     │ —
```

---

## 12. Ключові модулі (код)

### Єдине джерело membership

| Модуль                                                               | Відповідальність                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`live-round-membership.ts`](../lib/online/live-round-membership.ts) | `isInLiveRound`, `isActiveLivePlayer`, `isLiveParticipant`, opt-in |

| Питання                         | Функція                                           |
| ------------------------------- | ------------------------------------------------- |
| Хто голосує / presence на play? | `isActiveLivePlayer`                              |
| Standings / opponents?          | `isLiveParticipant`                               |
| Rejoin?                         | `isLiveParticipant` + `live-round-screen-actions` |
| Rematch-лобі?                   | `waitingLobbyOptInUids` / `player.online`         |

### Екрани

| Модуль                                                                       | Відповідальність                      |
| ---------------------------------------------------------------------------- | ------------------------------------- |
| [`live-round-screen-actions.ts`](../lib/online/live-round-screen-actions.ts) | Play / lobby / results guards         |
| [`frozen-round-view.ts`](../lib/online/frozen-round-view.ts)                 | Заморожений перегляд старіших раундів |
| [`opt-into-live-round.ts`](../lib/online/opt-into-live-round.ts)             | «Грати ще»                            |
| [`useLiveRoundPlayScreen`](../hooks/useLiveRoundPlayScreen.ts)               | Play effects                          |
| [`useLiveRoundLobbyScreen`](../hooks/useLiveRoundLobbyScreen.ts)             | Lobby auto-join + non-opt-in redirect |

### Інше

| Модуль                                                    | Відповідальність |
| --------------------------------------------------------- | ---------------- |
| `base-word-picker.ts`, `players-patch-for-round-start.ts` | Раунд / обирач   |
| `early-finish-vote.ts` (+ pause/add-time/resume)          | Голосування      |
| `exit-online-flow.ts`                                     | Вихід на головну |

---

_При зміні поведінки оновлюйте цей файл разом із `docs/firebase_schema.md` та мокапами за правилами проєкту._
