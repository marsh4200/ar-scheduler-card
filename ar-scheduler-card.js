class ARSchedulerCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("ar-scheduler-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:ar-scheduler-card",
      title: "AR Scheduler Card",
      scheduler: "",
      show_header_toggle: false,
      show_info: true,
      show_second_schedule: true,
      show_advanced: true,
      collapsed_sections: ["weekdays", "second", "advanced", "targets", "info"],
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration.");
    }

    this._config = {
      title: "AR Scheduler Card",
      show_header_toggle: false,
      show_info: true,
      show_second_schedule: true,
      show_advanced: true,
      collapsed_sections: ["weekdays", "second", "advanced", "targets", "info"],
      ...config,
    };

    this._collapsedSections = new Set(this._config.collapsed_sections || []);

    this._renderCard();
  }

  set hass(hass) {
    const nextSignature = this._getCardSignature(hass);
    const shouldRender =
      !this.shadowRoot ||
      !this._hass ||
      this._cardSignature !== nextSignature;

    this._hass = hass;
    this._cardSignature = nextSignature;

    if (shouldRender) {
      this._renderCard();
      return;
    }

    this.shadowRoot
      .querySelectorAll("hui-entities-card")
      .forEach((card) => {
        card.hass = this._hass;
      });

    this._refreshLiveContent();
  }

  getCardSize() {
    return this._config?.show_advanced ? 10 : 8;
  }

  _getSchedulers() {
    if (!this._hass?.states) {
      return [];
    }

    return Object.values(this._hass.states)
      .filter((stateObj) => {
        if (!stateObj?.entity_id?.startsWith("sensor.")) {
          return false;
        }

        const attrs = stateObj.attributes || {};
        return (
          typeof attrs.schedule_name === "string" &&
          Array.isArray(attrs.target_entities) &&
          Array.isArray(attrs.weekdays)
        );
      })
      .map((stateObj) => {
        const objectId = stateObj.entity_id.split(".", 2)[1];
        const base = objectId.replace(/_info$/, "");
        return {
          base,
          infoObjectId: objectId,
          infoEntity: stateObj.entity_id,
          title: stateObj.attributes.schedule_name || stateObj.attributes.friendly_name || base,
          targets: stateObj.attributes.target_entities || [],
          relatedEntities: stateObj.attributes.related_entities || {},
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  _getSelectedScheduler() {
    const schedulers = this._getSchedulers();
    if (!schedulers.length) {
      return null;
    }

    if (this._config?.scheduler) {
      return schedulers.find((item) => item.base === this._config.scheduler) || null;
    }

    return schedulers[0];
  }

  _getCardSignature(hass) {
    if (!hass?.states) {
      return "";
    }

    return Object.values(hass.states)
      .filter((stateObj) => {
        const attrs = stateObj.attributes || {};
        return (
          stateObj?.entity_id?.startsWith("sensor.") &&
          typeof attrs.schedule_name === "string" &&
          Array.isArray(attrs.target_entities) &&
          Array.isArray(attrs.weekdays)
        );
      })
      .map((stateObj) => {
        const attrs = stateObj.attributes || {};
        return [
          stateObj.entity_id,
          attrs.schedule_name || "",
          attrs.start_trigger || "",
          attrs.end_trigger || "",
          attrs.second_start_trigger || "",
          attrs.second_end_trigger || "",
          attrs.second_enabled ? "1" : "0",
          JSON.stringify(attrs.target_entities || []),
          JSON.stringify(attrs.related_entities || {}),
        ].join("|");
      })
      .sort()
      .join("::");
  }

  _entityIfExists(entityId, name) {
    if (!entityId || !this._hass?.states?.[entityId]) {
      return null;
    }

    return name ? { entity: entityId, name } : entityId;
  }

  _slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  _candidateBases(scheduler) {
    const bases = new Set();
    const rawBases = [
      scheduler?.base,
      scheduler?.infoObjectId?.replace(/_info$/, ""),
      this._slugify(scheduler?.title),
    ].filter(Boolean);

    rawBases.forEach((value) => {
      bases.add(value);
      bases.add(value.replace(/^ar_smart_scheduler_/, ""));
      bases.add(value.replace(/^arsmartscheduler_/, ""));
    });

    return [...bases].filter(Boolean);
  }

  _findRelatedEntity(domain, suffixes, scheduler, nameHints = []) {
    if (!this._hass?.states || !scheduler) {
      return null;
    }

    const wantedSuffixes = Array.isArray(suffixes) ? suffixes : [suffixes];
    const wantedNameHints = (Array.isArray(nameHints) ? nameHints : [nameHints])
      .filter(Boolean)
      .map((value) => this._slugify(value));
    for (const suffix of wantedSuffixes) {
      const relatedEntity = scheduler.relatedEntities?.[suffix];
      if (
        relatedEntity &&
        typeof relatedEntity === "string" &&
        relatedEntity.startsWith(`${domain}.`) &&
        this._hass.states[relatedEntity]
      ) {
        return relatedEntity;
      }
    }

    const candidateBases = this._candidateBases(scheduler);

    for (const candidateBase of candidateBases) {
      for (const suffix of wantedSuffixes) {
        const entityId = `${domain}.${candidateBase}_${suffix}`;
        if (this._hass.states[entityId]) {
          return entityId;
        }
      }
    }

    const titleSlug = this._slugify(scheduler.title);
    const matches = Object.values(this._hass.states).filter((stateObj) => {
      if (!stateObj.entity_id.startsWith(`${domain}.`)) {
        return false;
      }

      const objectId = stateObj.entity_id.split(".", 2)[1];
      const friendlyName = this._slugify(stateObj.attributes?.friendly_name);
      const suffixMatch = wantedSuffixes.some((suffix) => objectId.endsWith(`_${suffix}`));
      const nameHintMatch = wantedNameHints.some(
        (hint) => objectId.endsWith(`_${hint}`) || friendlyName.endsWith(hint)
      );
      const schedulerMatch =
        candidateBases.some((candidateBase) => objectId.includes(candidateBase)) ||
        (titleSlug && (objectId.includes(titleSlug) || friendlyName.includes(titleSlug)));

      return (suffixMatch || nameHintMatch) && schedulerMatch;
    });

    return matches.length ? matches[0].entity_id : null;
  }

  _getScheduleEnabledEntity(scheduler) {
    if (!scheduler || !this._hass?.states) {
      return null;
    }

    const directCandidates = [
      scheduler.relatedEntities?.schedule_enabled,
      scheduler.relatedEntities?.enabled,
    ].filter(Boolean);

    for (const entityId of directCandidates) {
      if (
        typeof entityId === "string" &&
        entityId.startsWith("switch.") &&
        this._hass.states[entityId]
      ) {
        return entityId;
      }
    }

    const fallback = this._findRelatedEntity("switch", ["schedule_enabled", "enabled"], scheduler);
    if (fallback) {
      return fallback;
    }

    const candidateBases = this._candidateBases(scheduler);
    const titleSlug = this._slugify(scheduler.title);

    const matches = Object.values(this._hass.states).filter((stateObj) => {
      if (!stateObj?.entity_id?.startsWith("switch.")) {
        return false;
      }

      const objectId = stateObj.entity_id.split(".", 2)[1];
      const friendlyName = this._slugify(stateObj.attributes?.friendly_name);
      const looksEnabled =
        objectId.endsWith("_enabled") ||
        objectId.endsWith("_schedule_enabled") ||
        friendlyName.includes("enable");

      const schedulerMatch =
        candidateBases.some((candidateBase) => objectId.includes(candidateBase)) ||
        (titleSlug && (objectId.includes(titleSlug) || friendlyName.includes(titleSlug)));

      return looksEnabled && schedulerMatch;
    });

    if (matches.length === 1) {
      return matches[0].entity_id;
    }

    const exactFriendlyNameMatch = matches.find((stateObj) => {
      const friendlyName = this._slugify(stateObj.attributes?.friendly_name);
      return (
        titleSlug &&
        friendlyName.includes(titleSlug) &&
        (friendlyName.includes("enable") || friendlyName.includes("schedule"))
      );
    });

    return exactFriendlyNameMatch?.entity_id || null;
  }

  _section(label) {
    return {
      type: "section",
      label,
    };
  }

  _toggleRow(entityId, name, icon) {
    const entity = this._entityIfExists(entityId, name);
    if (!entity) {
      return null;
    }

    return {
      ...entity,
      icon,
    };
  }

  _pushSectionWithEntities(entities, label, sectionEntities) {
    const validEntities = (sectionEntities || []).filter(Boolean);
    if (!validEntities.length) {
      return;
    }

    entities.push(this._section(label), ...validEntities);
  }

  _getSchedulerInfoAttributes(scheduler) {
    return this._hass?.states?.[scheduler?.infoEntity]?.attributes || {};
  }

  _formatOffset(minutes) {
    const value = Number(minutes || 0);
    if (!value) {
      return "no offset";
    }

    return `${value > 0 ? "+" : ""}${value} min`;
  }

  _titleCase(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  _formatTriggerSummary(label, trigger, timeValue, offsetMinutes) {
    if (!trigger) {
      return null;
    }

    if (trigger === "time") {
      return {
        label,
        value: timeValue ? `Fixed time: ${timeValue}` : "Fixed time",
      };
    }

    return {
      label,
      value: `${this._titleCase(trigger)} (${this._formatOffset(offsetMinutes)})`,
    };
  }

  _formatActionSummary(label, service, data) {
    if (!service) {
      return null;
    }

    const details = data && typeof data === "object" ? data : {};

    if (service === "open_cover") {
      return { label, value: "Open cover" };
    }
    if (service === "close_cover") {
      return { label, value: "Close cover" };
    }
    if (service === "set_cover_position") {
      const position = details.position;
      return { label, value: position != null ? `Set cover to ${position}%` : "Set cover position" };
    }
    if (service === "turn_on") {
      const brightness = details.brightness_pct;
      return { label, value: brightness != null ? `Turn on to ${brightness}%` : "Turn on" };
    }
    if (service === "turn_off") {
      return { label, value: "Turn off" };
    }
    if (service === "set_temperature") {
      const temperature = details.temperature;
      return {
        label,
        value: temperature != null ? `Set temperature to ${temperature}°C` : "Set temperature",
      };
    }
    if (service === "set_hvac_mode") {
      return {
        label,
        value: details.hvac_mode ? `Set HVAC mode to ${this._titleCase(details.hvac_mode)}` : "Set HVAC mode",
      };
    }
    if (service === "set_operation_mode") {
      return {
        label,
        value: details.operation_mode
          ? `Set operation mode to ${this._titleCase(details.operation_mode)}`
          : "Set operation mode",
      };
    }
    if (service === "unlock") {
      return { label, value: "Unlock" };
    }
    if (service === "lock") {
      return { label, value: "Lock" };
    }

    return {
      label,
      value: `${this._titleCase(service)}${Object.keys(details).length ? ` (${JSON.stringify(details)})` : ""}`,
    };
  }

  _buildSummaryItems(scheduler) {
    const info = this._getSchedulerInfoAttributes(scheduler);
    const hasSolarTrigger = [
      info.start_trigger,
      info.end_trigger,
      info.second_start_trigger,
      info.second_end_trigger,
    ].some((trigger) => trigger === "sunrise" || trigger === "sunset");
    const summaryItems = [
      this._formatTriggerSummary("Start", info.start_trigger, info.start_time, info.start_offset_minutes),
      this._formatTriggerSummary("End", info.end_trigger, info.end_time, info.end_offset_minutes),
      this._formatActionSummary("Start Action", info.start_service, info.start_data),
      this._formatActionSummary("End Action", info.end_service, info.end_data),
    ];

    if (info.second_enabled) {
      summaryItems.push(
        this._formatTriggerSummary(
          "Second Start",
          info.second_start_trigger,
          info.second_start_time,
          info.second_start_offset_minutes
        ),
        this._formatTriggerSummary(
          "Second End",
          info.second_end_trigger,
          info.second_end_time,
          info.second_end_offset_minutes
        )
      );
    }

    if (hasSolarTrigger) {
      summaryItems.unshift({
        label: "Scheduler Control",
        value: this._titleCase(this._hass?.states?.[scheduler.infoEntity]?.state || "unknown"),
      });
    }

    return summaryItems.filter(Boolean);
  }

  _renderSummary(summaryItems) {
    if (!summaryItems.length) {
      return "";
    }

    return `
      <div class="summary">
        <div class="summary-title">Current Setup</div>
        <div class="summary-grid">
          ${summaryItems
            .map(
              (item) => `
                <div class="summary-item" data-summary-label="${item.label}">
                  <div class="summary-label">${item.label}</div>
                  <div class="summary-value">${item.value}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  _refreshLiveContent() {
    if (!this.shadowRoot || !this._config) {
      return;
    }

    const scheduler = this._getSelectedScheduler();
    const summaryHost = this.shadowRoot.querySelector(".summary-host");
    if (summaryHost) {
      const summaryItems = scheduler ? this._buildSummaryItems(scheduler) : [];
      const existingItems = [...summaryHost.querySelectorAll(".summary-item")];
      const canPatchInPlace =
        summaryItems.length > 0 &&
        existingItems.length === summaryItems.length &&
        existingItems.every(
          (element, index) => element.getAttribute("data-summary-label") === summaryItems[index].label
        );

      if (canPatchInPlace) {
        existingItems.forEach((element, index) => {
          const valueElement = element.querySelector(".summary-value");
          if (valueElement && valueElement.textContent !== summaryItems[index].value) {
            valueElement.textContent = summaryItems[index].value;
          }
        });
        return;
      }

      summaryHost.innerHTML = summaryItems.length
        ? this._renderSummary(summaryItems)
        : "";
    }
  }

  _buildSection(key, title, sectionEntities, options = {}) {
    const validEntities = (sectionEntities || []).filter(Boolean);
    if (!validEntities.length) {
      return null;
    }

    return {
      key,
      title,
      icon: options.icon || "mdi:tune",
      defaultCollapsed: Boolean(options.defaultCollapsed),
      entities: validEntities,
    };
  }

  _getCollapsedSections() {
    if (!this._collapsedSections) {
      this._collapsedSections = new Set(this._config?.collapsed_sections || []);
    }

    return this._collapsedSections;
  }

  _isSectionCollapsed(section) {
    return this._getCollapsedSections().has(section.key) || section.defaultCollapsed;
  }

  _persistCollapsedSections() {
    this._config = {
      ...this._config,
      collapsed_sections: [...this._getCollapsedSections()],
    };
  }

  _buildSections() {
    const scheduler = this._getSelectedScheduler();
    if (!scheduler) {
      return null;
    }

    const info = this._getSchedulerInfoAttributes(scheduler);
    const showStartTimeRow = info.start_trigger === "time";
    const showEndTimeRow = info.end_trigger === "time";
    const showSecondStartTimeRow = info.second_start_trigger === "time";
    const showSecondEndTimeRow = info.second_end_trigger === "time";

    const sections = [];

    sections.push(this._buildSection(
      "weekdays",
      "Weekdays",
      [
        ["mon", "Monday"],
        ["tue", "Tuesday"],
        ["wed", "Wednesday"],
        ["thu", "Thursday"],
        ["fri", "Friday"],
        ["sat", "Saturday"],
        ["sun", "Sunday"],
      ].map(([day, label]) =>
        this._toggleRow(
          this._findRelatedEntity("switch", day, scheduler),
          label,
          "mdi:toggle-switch"
        )
      ),
      { icon: "mdi:calendar-week", defaultCollapsed: true }
    ));

    sections.push(this._buildSection("primary", "First Timer", [
      this._entityIfExists(this._findRelatedEntity("select", "start_trigger", scheduler, "start_trigger"), "Start Trigger"),
      showStartTimeRow
        ? this._entityIfExists(this._findRelatedEntity("time", ["start_time", "start"], scheduler, "start_time"), "Start Time")
        : null,
      this._entityIfExists(this._findRelatedEntity("number", "start_offset", scheduler, "start_offset"), "Start Offset"),
      this._entityIfExists(this._findRelatedEntity("select", "end_trigger", scheduler, "end_trigger"), "End Trigger"),
      showEndTimeRow
        ? this._entityIfExists(this._findRelatedEntity("time", ["end_time", "end"], scheduler, "end_time"), "End Time")
        : null,
      this._entityIfExists(this._findRelatedEntity("number", "end_offset", scheduler, "end_offset"), "End Offset"),
    ], { icon: "mdi:clock-outline" }));

    if (this._config.show_second_schedule && info.second_enabled) {
      sections.push(this._buildSection("second", "Second Timer", [
        this._entityIfExists(this._findRelatedEntity("select", "second_start_trigger", scheduler, "second_start_trigger"), "Second Start Trigger"),
        showSecondStartTimeRow
          ? this._entityIfExists(this._findRelatedEntity("time", ["second_start_time", "start2"], scheduler, "second_start_time"), "Second Start Time")
          : null,
        this._entityIfExists(this._findRelatedEntity("number", "second_start_offset", scheduler, "second_start_offset"), "Second Start Offset"),
        this._entityIfExists(this._findRelatedEntity("select", "second_end_trigger", scheduler, "second_end_trigger"), "Second End Trigger"),
        showSecondEndTimeRow
          ? this._entityIfExists(this._findRelatedEntity("time", ["second_end_time", "end2"], scheduler, "second_end_time"), "Second End Time")
          : null,
        this._entityIfExists(this._findRelatedEntity("number", "second_end_offset", scheduler, "second_end_offset"), "Second End Offset"),
      ], { icon: "mdi:clock-plus-outline", defaultCollapsed: true }));
    }

    if (scheduler.targets.length) {
      sections.push(this._buildSection(
        "targets",
        "Targets",
        scheduler.targets.filter((target) => this._hass.states[target]),
        { icon: "mdi:target-variant", defaultCollapsed: true }
      ));
    }

    if (this._config.show_advanced) {
      sections.push(this._buildSection("advanced", "Advanced", [
        this._entityIfExists(this._findRelatedEntity("select", "climate_start_action", scheduler, ["start_hvac_action", "climate_start_action"]), "Start HVAC Action"),
        this._entityIfExists(this._findRelatedEntity("number", "climate_start_temperature", scheduler, ["start_hvac_temperature", "climate_start_temperature"]), "Start HVAC Temperature"),
        this._entityIfExists(this._findRelatedEntity("select", "climate_end_action", scheduler, ["end_hvac_action", "climate_end_action"]), "End HVAC Action"),
        this._entityIfExists(this._findRelatedEntity("number", "climate_end_temperature", scheduler, ["end_hvac_temperature", "climate_end_temperature"]), "End HVAC Temperature"),
        this._entityIfExists(this._findRelatedEntity("select", "water_heater_start_action", scheduler, ["start_water_heater_action", "water_heater_start_action"]), "Start Water Heater Action"),
        this._entityIfExists(this._findRelatedEntity("number", "water_heater_start_temperature", scheduler, ["start_water_heater_temperature", "water_heater_start_temperature"]), "Start Water Heater Temperature"),
        this._entityIfExists(this._findRelatedEntity("select", "water_heater_end_action", scheduler, ["end_water_heater_action", "water_heater_end_action"]), "End Water Heater Action"),
        this._entityIfExists(this._findRelatedEntity("number", "water_heater_end_temperature", scheduler, ["end_water_heater_temperature", "water_heater_end_temperature"]), "End Water Heater Temperature"),
      ], { icon: "mdi:tune-vertical", defaultCollapsed: true }));
    }

    if (this._config.show_info) {
      sections.push(this._buildSection("info", "Info", [
        this._entityIfExists(scheduler.infoEntity, "Scheduler Status"),
      ], { icon: "mdi:information-outline", defaultCollapsed: true }));
    }

    return sections.filter(Boolean);
  }

  _buildTopControls() {
    const scheduler = this._getSelectedScheduler();
    if (!scheduler) {
      return [];
    }

    return [
      this._toggleRow(
        this._getScheduleEnabledEntity(scheduler),
        "Enable Schedule",
        "mdi:calendar-check"
      ),
    ].filter(Boolean);
  }

  _createSectionCard(section) {
    const card = document.createElement("hui-entities-card");
    card.setConfig({
      type: "entities",
      show_header_toggle: false,
      state_color: true,
      entities: section.entities,
    });
    if (this._hass) {
      card.hass = this._hass;
    }
    return card;
  }

  _createTopControlsCard(entities) {
    if (!entities.length) {
      return null;
    }

    const card = document.createElement("hui-entities-card");
    card.setConfig({
      type: "entities",
      title: "Schedule Control",
      show_header_toggle: false,
      state_color: true,
      entities,
    });
    if (this._hass) {
      card.hass = this._hass;
    }
    return card;
  }

  _renderSections(container, sections) {
    sections.forEach((section) => {
      const collapsed = this._isSectionCollapsed(section);
      const wrapper = document.createElement("div");
      wrapper.className = `fold-section${section.key === "primary" || section.key === "second" ? " timer-section" : ""}`;
      wrapper.innerHTML = `
        <button class="fold-header" type="button" data-section="${section.key}" aria-expanded="${(!collapsed).toString()}">
          <span class="fold-title-wrap">
            <ha-icon class="fold-icon" icon="${section.icon}"></ha-icon>
            <span class="fold-title">${section.title}</span>
          </span>
          <ha-icon class="fold-chevron ${collapsed ? "" : "is-open"}" icon="mdi:chevron-down"></ha-icon>
        </button>
        <div class="fold-body ${collapsed ? "is-collapsed" : ""}" data-body="${section.key}"></div>
      `;

      const body = wrapper.querySelector(`[data-body="${section.key}"]`);
      if (body) {
        if (!collapsed) {
          body.appendChild(this._createSectionCard(section));
          body.classList.add("is-open");
          body.style.maxHeight = "none";
          body.style.opacity = "1";
        } else {
          body.style.maxHeight = "0px";
          body.style.opacity = "0";
        }
      }

      const button = wrapper.querySelector(`[data-section="${section.key}"]`);
      if (button && body) {
        button.addEventListener("click", () => {
          if (body._collapseTimer) {
            window.clearTimeout(body._collapseTimer);
            body._collapseTimer = null;
          }

          const opening = body.classList.contains("is-collapsed");
          button.setAttribute("aria-expanded", opening.toString());

          const chevron = button.querySelector(".fold-chevron");
          if (chevron) {
            chevron.classList.toggle("is-open", opening);
          }

          if (opening) {
            if (!body.childElementCount) {
              body.appendChild(this._createSectionCard(section));
            }
            body.classList.remove("is-collapsed");
            body.classList.add("is-open");
            body.style.maxHeight = "0px";
            body.style.opacity = "0";
            requestAnimationFrame(() => {
              body.style.maxHeight = `${body.scrollHeight + 12}px`;
              body.style.opacity = "1";
            });
            body._expandTimer = window.setTimeout(() => {
              body.style.maxHeight = "none";
              body._expandTimer = null;
            }, 220);
          } else {
            if (body._expandTimer) {
              window.clearTimeout(body._expandTimer);
              body._expandTimer = null;
            }
            body.style.maxHeight = `${body.scrollHeight + 12}px`;
            body.style.opacity = "1";
            requestAnimationFrame(() => {
              body.style.maxHeight = "0px";
              body.style.opacity = "0";
            });
            body._collapseTimer = window.setTimeout(() => {
              body.classList.add("is-collapsed");
              body.classList.remove("is-open");
              body._collapseTimer = null;
            }, 220);
          }

          const collapsedSections = this._getCollapsedSections();
          if (opening) {
            collapsedSections.delete(section.key);
          } else {
            collapsedSections.add(section.key);
          }
          this._persistCollapsedSections();
        });
      }

      container.appendChild(wrapper);
    });
  }

  _renderCard() {
    if (!this._config) {
      return;
    }

    const scheduler = this._getSelectedScheduler();
    const sections = this._buildSections();
    const topControls = this._buildTopControls();
    const hasScheduler = Boolean(sections?.length);

    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        ha-card {
          overflow: hidden;
        }

        .card-shell {
          padding: 16px;
          background:
            radial-gradient(circle at top right, rgba(56, 189, 248, 0.12), transparent 32%),
            radial-gradient(circle at bottom left, rgba(34, 197, 94, 0.1), transparent 28%);
        }

        .empty {
          color: var(--secondary-text-color);
          line-height: 1.5;
        }

        .title {
          font-size: 1rem;
          font-weight: 700;
          margin-bottom: 10px;
          letter-spacing: 0.01em;
          color: var(--primary-text-color);
        }

        .summary {
          margin-bottom: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background:
            linear-gradient(135deg, rgba(66, 133, 244, 0.14), rgba(52, 168, 83, 0.08)),
            var(--ha-card-background, var(--card-background-color, #fff));
          border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.2));
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(6px);
          animation: fadeSlideIn 240ms ease;
        }

        .summary-title {
          margin-bottom: 6px;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--primary-text-color);
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 6px 10px;
        }

        .summary-item {
          display: grid;
          gap: 1px;
          padding: 2px 0;
        }

        .summary-label {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }

        .summary-value {
          font-size: 0.82rem;
          color: var(--primary-text-color);
          line-height: 1.25;
          word-break: break-word;
        }

        .sections {
          display: grid;
          gap: 10px;
        }

        .top-controls {
          margin-bottom: 12px;
          animation: fadeSlideIn 280ms ease;
        }

        .top-controls hui-entities-card {
          display: block;
        }

        .top-controls hui-entities-card ha-card {
          box-shadow: none;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent);
          border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.2));
          border-radius: 14px;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .top-controls hui-entities-card ha-card:hover {
          transform: translateY(-1px);
          border-color: rgba(59, 130, 246, 0.24);
        }

        .fold-section {
          overflow: hidden;
          border-radius: 14px;
          border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.2));
          background: var(--ha-card-background, var(--card-background-color, #fff));
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
          animation: fadeSlideIn 320ms ease;
        }

        .timer-section {
          background:
            linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.01)),
            var(--ha-card-background, var(--card-background-color, #fff));
          border-color: rgba(59, 130, 246, 0.22);
          --primary-text-color: var(--primary-text-color);
          --secondary-text-color: var(--secondary-text-color);
          --paper-item-icon-color: var(--primary-color);
          --state-icon-color: var(--primary-color);
          --input-ink-color: var(--primary-text-color);
          --input-label-ink-color: var(--secondary-text-color);
          --mdc-theme-text-primary-on-background: var(--primary-text-color);
          --mdc-select-ink-color: var(--primary-text-color);
          --mdc-select-label-ink-color: var(--secondary-text-color);
          --mdc-select-dropdown-icon-color: var(--primary-color);
          --mdc-text-field-ink-color: var(--primary-text-color);
          --mdc-text-field-label-ink-color: var(--secondary-text-color);
          --mdc-menu-item-ink-color: var(--primary-text-color);
        }

        .fold-section:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 26px rgba(15, 23, 42, 0.08);
          border-color: rgba(59, 130, 246, 0.22);
        }

        .fold-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border: 0;
          background: transparent;
          color: var(--primary-text-color);
          text-align: left;
          cursor: pointer;
          position: relative;
          transition: background 0.18s ease;
        }

        .fold-header:hover {
          background: linear-gradient(90deg, rgba(59, 130, 246, 0.06), transparent 60%);
        }

        .fold-title-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .fold-title {
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.01em;
        }

        .fold-icon,
        .fold-chevron {
          color: var(--secondary-text-color);
        }

        .fold-chevron {
          transition: transform 0.22s ease, color 0.18s ease;
        }

        .fold-chevron.is-open {
          transform: rotate(180deg);
          color: var(--primary-color);
        }

        .fold-body {
          padding: 0 10px 10px;
          overflow: hidden;
          transition: max-height 0.22s ease, opacity 0.18s ease;
          will-change: max-height, opacity;
        }

        .fold-body.is-collapsed {
          padding-bottom: 0;
        }

        .fold-body hui-entities-card {
          display: block;
          transform-origin: top center;
        }

        .fold-body hui-entities-card ha-card {
          box-shadow: none;
          background: transparent;
          border-radius: 0;
        }

        .timer-section .fold-body hui-entities-card ha-card {
          background: rgba(255, 255, 255, 0.22);
        }

        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      </style>
      <ha-card>
        <div class="card-shell">
          <div class="title">${this._config.title || scheduler?.title || "AR Scheduler Card"}</div>
          <div class="summary-host"></div>
          <div class="top-controls"></div>
          <div class="sections"></div>
        </div>
      </ha-card>
    `;

    const topControlsContainer = this.shadowRoot.querySelector(".top-controls");
    const container = this.shadowRoot.querySelector(".sections");

    if (topControlsContainer) {
      const topCard = this._createTopControlsCard(topControls);
      if (topCard) {
        topControlsContainer.appendChild(topCard);
      }
    }

    this._refreshLiveContent();

    if (!hasScheduler) {
      if (container) {
        container.innerHTML = `
          <div class="empty">
            No AR Smart Scheduler entities were found.
            Create at least one scheduler in the integration, then reload this dashboard.
          </div>
        `;
      }
      return;
    }

    try {
      this._renderSections(container, sections);
    } catch (error) {
      if (container) {
        container.innerHTML = `
          <div class="empty">
            Card failed to render.<br>
            ${error?.message || error}
          </div>
        `;
      }
    }
  }
}

class ARSchedulerCardEditor extends HTMLElement {
  setConfig(config) {
    const nextConfig = config || {};
    const nextSignature = JSON.stringify(nextConfig);

    if (this._configSignature === nextSignature && this.shadowRoot) {
      return;
    }

    this._config = nextConfig;
    this._configSignature = nextSignature;
    this._render();
  }

  set hass(hass) {
    const nextSchedulerSignature = this._getSchedulerSignature(hass);
    const shouldRender =
      !this.shadowRoot ||
      !this._hass ||
      this._schedulerSignature !== nextSchedulerSignature;

    this._hass = hass;
    this._schedulerSignature = nextSchedulerSignature;

    if (shouldRender) {
      this._render();
    }
  }

  _getSchedulers() {
    if (!this._hass?.states) {
      return [];
    }

    return Object.values(this._hass.states)
      .filter((stateObj) => {
        if (!stateObj?.entity_id?.startsWith("sensor.")) {
          return false;
        }

        const attrs = stateObj.attributes || {};
        return (
          typeof attrs.schedule_name === "string" &&
          Array.isArray(attrs.target_entities) &&
          Array.isArray(attrs.weekdays)
        );
      })
      .map((stateObj) => {
        const objectId = stateObj.entity_id.split(".", 2)[1];
        return {
          value: objectId.replace(/_info$/, ""),
          label: stateObj.attributes.schedule_name || stateObj.attributes.friendly_name || objectId,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  _getSchedulerSignature(hass) {
    if (!hass?.states) {
      return "";
    }

    return Object.values(hass.states)
      .filter((stateObj) => {
        if (!stateObj?.entity_id?.startsWith("sensor.")) {
          return false;
        }

        const attrs = stateObj.attributes || {};
        return (
          typeof attrs.schedule_name === "string" &&
          Array.isArray(attrs.target_entities) &&
          Array.isArray(attrs.weekdays)
        );
      })
      .map((stateObj) => {
        const objectId = stateObj.entity_id.split(".", 2)[1];
        const label =
          stateObj.attributes.schedule_name ||
          stateObj.attributes.friendly_name ||
          objectId;
        return `${objectId}:${label}`;
      })
      .sort()
      .join("|");
  }

  _render() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }

    const config = this._config || {};
    const schedulers = this._getSchedulers();
    const selected = config.scheduler || schedulers[0]?.value || "";

    this.shadowRoot.innerHTML = `
      <style>
        .form {
          display: grid;
          gap: 12px;
          padding: 12px;
          background: var(--card-background-color, var(--ha-card-background, #fff));
          border-radius: 12px;
        }

        label {
          display: grid;
          gap: 6px;
          font-size: 0.9rem;
          color: var(--primary-text-color);
        }

        .field-label {
          font-weight: 600;
        }

        input,
        select {
          font: inherit;
          padding: 8px 10px;
          border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.35));
          border-radius: 10px;
          background: var(--secondary-background-color, var(--card-background-color, #fff));
          color: var(--primary-text-color);
          outline: none;
        }

        .hint {
          color: var(--secondary-text-color);
          font-size: 0.85rem;
        }
      </style>
      <div class="form">
        <label>
          <span class="field-label">Title</span>
          <input name="title" value="${config.title || "AR Scheduler Card"}" />
        </label>
        <label>
          <span class="field-label">Scheduler</span>
          <select name="scheduler">
            ${
              schedulers.length
                ? schedulers
                    .map(
                      (item) =>
                        `<option value="${item.value}" ${item.value === selected ? "selected" : ""}>${item.label}</option>`
                    )
                    .join("")
                : '<option value="">No AR Smart Scheduler entities found</option>'
            }
          </select>
        </label>
        <label>
          <span class="field-label">Info Panel</span>
          <select name="show_info">
            <option value="true" ${config.show_info !== false ? "selected" : ""}>Show info</option>
            <option value="false" ${config.show_info === false ? "selected" : ""}>Hide info</option>
          </select>
        </label>
        <label>
          <span class="field-label">Second Schedule</span>
          <select name="show_second_schedule">
            <option value="true" ${config.show_second_schedule !== false ? "selected" : ""}>Show second schedule</option>
            <option value="false" ${config.show_second_schedule === false ? "selected" : ""}>Hide second schedule</option>
          </select>
        </label>
        <label>
          <span class="field-label">Advanced Options</span>
          <select name="show_advanced">
            <option value="true" ${config.show_advanced !== false ? "selected" : ""}>Show advanced options</option>
            <option value="false" ${config.show_advanced === false ? "selected" : ""}>Hide advanced options</option>
          </select>
        </label>
        <label>
          <span class="field-label">Header Toggle</span>
          <select name="show_header_toggle">
            <option value="true" ${config.show_header_toggle === true ? "selected" : ""}>Show header toggle</option>
            <option value="false" ${config.show_header_toggle !== true ? "selected" : ""}>Hide header toggle</option>
          </select>
        </label>
        <div class="hint">This selector only lists schedulers detected from the AR Smart Scheduler integration.</div>
      </div>
    `;

    this.shadowRoot.querySelectorAll("input, select").forEach((element) => {
      const handler = (event) => this._valueChanged(event);
      element.addEventListener("change", handler);
      if (element.tagName === "INPUT") {
        element.addEventListener("input", handler);
      }
    });
  }

  _valueChanged(event) {
    const target = event.target;
    if (!target) {
      return;
    }

    const value =
      target.name === "show_info" ||
      target.name === "show_second_schedule" ||
      target.name === "show_advanced" ||
      target.name === "show_header_toggle"
        ? target.value === "true"
        : target.value;

    const nextConfig = {
      ...this._config,
      [target.name]: value,
    };

    this._config = nextConfig;

    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: {
          config: nextConfig,
        },
      })
    );
  }
}

if (!customElements.get("ar-scheduler-card")) {
  customElements.define("ar-scheduler-card", ARSchedulerCard);
}

if (!customElements.get("ar-scheduler-card-editor")) {
  customElements.define("ar-scheduler-card-editor", ARSchedulerCardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ar-scheduler-card",
  name: "AR Scheduler Card",
  description: "Scheduler card for AR Smart Scheduler entities with automatic scheduler discovery.",
});
