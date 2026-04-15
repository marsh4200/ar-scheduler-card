# 🗓️ AR-Scheduler-Card

[![GitHub release](https://img.shields.io/github/v/release/marsh4200/ar-scheduler-card.svg)](https://github.com/marsh4200/ar-scheduler-card/releases)  
[![HACS Custom](https://img.shields.io/badge/HACS-Custom-blue.svg)](https://github.com/custom-components/hacs)  
[![Add to HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=marsh4200&repository=ar-scheduler-card&category=plugin)

---

✨ A modern custom Lovelace card built exclusively for **AR Smart Scheduler**, designed to give you a clean, intuitive, and installer-friendly way to view and control your schedules directly from the Home Assistant dashboard.

This card is purpose-built to work hand-in-hand with the AR Smart Scheduler integration, providing a seamless frontend experience for managing scheduled automations such as lights, pumps, gates, garage doors, and more — all without needing to dive into complex settings or backend configuration.

---

## ⚠️ Important

🚫 This card **is not a standalone component**  
🔗 It **requires the AR Smart Scheduler integration** to be installed and fully configured  

Without the integration:
- No entities will be available  
- No schedules will display  
- The card will not function  

---

## 💡 What this card is for

- 📅 Display and manage scheduled entities created in AR Smart Scheduler  
- ⏱️ Visualise start & end times in a clean layout  
- 🔘 Quickly enable or disable schedules  
- 🛠️ Designed for both installers and end users  
- 🖥️ Perfect for dashboards where clients can adjust schedules without admin access  

---

## 🎯 Built with purpose

This card was created with real-world installations in mind — where simplicity, clarity, and reliability matter. Instead of exposing users to complex automation logic, the AR-Scheduler-Card provides a straightforward interface that makes schedule control easy and accessible.

---

## 🚀 Seamless integration

When used together with AR Smart Scheduler, this card delivers:
- ⚡ Real-time updates  
- 🧠 Smart scheduling control  
- 🎛️ Clean UI for client handover  
- 🔧 Easy deployment via HACS  

---

## 📦 Installation

### 🧩 HACS (Recommended)

Click below to install directly into Home Assistant:

[![Add to HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=marsh4200&repository=ar-scheduler-card&category=plugin)

---

### 🛠️ Manual Installation

1. Download `ar-scheduler-card.js`  
2. Copy it to your Home Assistant `/config/www/` folder  
3. Add the resource to your dashboard:

```yaml
resources:
  - url: /local/ar-scheduler-card.js
    type: module
⚙️ After Installation (IMPORTANT)

If installed via HACS, add this resource:

resources:
  - url: /hacsfiles/ar-scheduler-card/ar-scheduler-card.js
    type: module

Then reload your dashboard.

🧠 Usage

Once installed, add the card to your dashboard:

type: custom:ar-scheduler-card
entity: switch.fri_3
⚠️ Requirements
Requires AR Smart Scheduler integration
Will not function without scheduler entities
🔥 In short

AR-Scheduler-Card is the visual layer of AR Smart Scheduler — built to make powerful scheduling simple.


---

## 💡 Quick tip
- Save as: `README.md`
- Encoding: UTF-8
- Upload to your repo root

---

If you want next level:
👉 I can add **GIF preview, screenshots, or marketplace-level polish** so your repo looks like a top HACS project 🔥
