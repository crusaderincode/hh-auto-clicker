// ==UserScript==
// @name         HH.ru Auto Scroll & Next Page (Human-like + Limit + Vacancy Opener)
// @namespace    http://tampermonkey.net/
// @version      7.3
// @description  Human-like scrolling with SPA support + opens 1-4 vacancies per page (slower natural scroll)
// @author       You
// @match        https://hh.ru/search/vacancy*
// @match        https://*.hh.ru/search/vacancy*
// @match        https://hh.ru/vacancy/*
// @match        https://*.hh.ru/vacancy/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ================= НАСТРОЙКИ =================

  const SESSION_TIME_MIN = 15 * 60 * 1000;
  const SESSION_TIME_MAX = 45 * 60 * 1000;

  const PAGE_LIMIT_MIN = 8;
  const PAGE_LIMIT_MAX = 20;

  const SCROLL_STEP_MIN = 60;
  const SCROLL_STEP_MAX = 160;
  const SCROLL_DELAY_MIN = 80;
  const SCROLL_DELAY_MAX = 260;

  // Количество вакансий для открытия на странице (1-4)
  const VACANCIES_TO_OPEN_MIN = 1;
  const VACANCIES_TO_OPEN_MAX = 4;

  // Время на "чтение" вакансии (в секундах)
  const VACANCY_READ_TIME_MIN = 8;
  const VACANCY_READ_TIME_MAX = 20;

  // Задержка перед возвратом назад
  const BACK_DELAY_MIN = 1000;
  const BACK_DELAY_MAX = 2500;

  // ============================================

  const sessionStart = GM_getValue("sessionStart") || Date.now();
  GM_setValue("sessionStart", sessionStart);

  const sessionLimit =
    GM_getValue("sessionLimit") || rand(SESSION_TIME_MIN, SESSION_TIME_MAX);
  GM_setValue("sessionLimit", sessionLimit);

  const pageLimit =
    GM_getValue("pageLimit") || Math.floor(rand(PAGE_LIMIT_MIN, PAGE_LIMIT_MAX));
  GM_setValue("pageLimit", pageLimit);

  let pagesVisited = GM_getValue("pagesVisited", 0);
  let shouldStop = false;
  let statusElement;
  let observer;

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function sessionExpired() {
    return (
      Date.now() - sessionStart > sessionLimit || pagesVisited >= pageLimit
    );
  }

  function updateStatus(msg, bg = "#333") {
    if (statusElement) {
      statusElement.innerHTML = msg;
      statusElement.style.background = bg;
    }
  }

  function createStatus() {
    if (statusElement) return;

    statusElement = document.createElement("div");
    statusElement.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 14px;
            color: #fff;
            background: #333;
            border-radius: 8px;
            z-index: 99999;
            font-size: 14px;
            line-height: 1.4;
        `;
    document.body.appendChild(statusElement);
  }

  // Проверка, находимся ли мы на странице вакансии (а не на странице поиска)
  function isVacancyPage() {
    // Страница вакансии: /vacancy/12345...
    // Страница поиска: /search/vacancy... или /search/vacancy?page=1...
    return window.location.pathname.includes('/vacancy/') && 
           !window.location.pathname.includes('/search/vacancy');
  }

  // Получить случайные вакансии для открытия
  function getRandomVacancies() {
    const allVacancies = Array.from(
      document.querySelectorAll('div[data-qa="vacancy-serp__vacancy"]')
    );

    if (allVacancies.length === 0) return [];

    const count = Math.min(
      Math.floor(rand(VACANCIES_TO_OPEN_MIN, VACANCIES_TO_OPEN_MAX + 1)),
      allVacancies.length
    );

    // Перемешиваем и берём первые count элементов
    const shuffled = allVacancies.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // Скролл страницы вакансии
  async function scrollVacancyPage() {
    const readTime = rand(
      VACANCY_READ_TIME_MIN * 1000,
      VACANCY_READ_TIME_MAX * 1000
    );
    const startTime = Date.now();

    updateStatus("📖 Reading vacancy...", "#FF9800");

    while (Date.now() - startTime < readTime) {
      if (sessionExpired()) return;

      window.scrollBy(0, rand(SCROLL_STEP_MIN, SCROLL_STEP_MAX));
      await sleep(rand(SCROLL_DELAY_MIN, SCROLL_DELAY_MAX));

      // Если достигли конца страницы, прекращаем скролл
      if (
        window.innerHeight + window.scrollY >=
        document.body.scrollHeight - 10
      ) {
        await sleep(rand(1000, 2000));
        break;
      }
    }
  }

  // Открыть вакансии
  async function openVacancies() {
    const vacancies = getRandomVacancies();

    if (vacancies.length === 0) {
      updateStatus("⚠️ No vacancies found", "#FF5722");
      return;
    }

    updateStatus(`🔍 Opening ${vacancies.length} vacancies...`, "#9C27B0");

    for (let i = 0; i < vacancies.length; i++) {
      if (sessionExpired()) return;

      updateStatus(
        `📂 Opening vacancy ${i + 1}/${vacancies.length}`,
        "#9C27B0"
      );

      // Кликаем прямо на div вакансии
      const vacancyDiv = vacancies[i];
      if (!vacancyDiv) continue;

      // Сохраняем индекс следующей вакансии для открытия
      GM_setValue("nextVacancyIndex", i + 1);
      GM_setValue("totalVacancies", vacancies.length);

      // Кликаем на вакансию
      await sleep(rand(500, 1500));
      vacancyDiv.click();

      // Ждём загрузки страницы вакансии и её скролла
      // После клика произойдёт редирект, и скрипт запустится заново на странице вакансии
      return;
    }
    
    // Все вакансии открыты, очищаем счётчики
    GM_setValue("nextVacancyIndex", 0);
    GM_setValue("totalVacancies", 0);
  }

  // Обработка страницы вакансии
  async function handleVacancyPage() {
    updateStatus("📄 On vacancy page", "#673AB7");

    // Скроллим страницу вакансии
    await scrollVacancyPage();

    // Возвращаемся назад
    const nextIndex = GM_getValue("nextVacancyIndex", 0);
    const total = GM_getValue("totalVacancies", 0);
    const searchPageUrl = GM_getValue("searchPageUrl", "");
    
    if (nextIndex > 0 && total > 0) {
      updateStatus(`⬅️ Back (${nextIndex}/${total} done)`, "#3F51B5");
    } else {
      updateStatus("⬅️ Going back...", "#3F51B5");
    }
    
    await sleep(rand(BACK_DELAY_MIN, BACK_DELAY_MAX));
    
    // Возвращаемся на страницу поиска по сохранённому URL
    if (searchPageUrl) {
      console.log('[HH Auto] Returning to search page:', searchPageUrl);
      window.location.href = searchPageUrl;
    } else {
      // Fallback: пробуем history.back()
      console.warn('[HH Auto] No saved URL, trying history.back()');
      window.history.back();
    }
  }

  // Обычный скролл списка вакансий
  async function scrollToBottom() {
    while (!shouldStop) {
      if (sessionExpired()) return;
      window.scrollBy(0, rand(SCROLL_STEP_MIN, SCROLL_STEP_MAX));
      await sleep(rand(SCROLL_DELAY_MIN, SCROLL_DELAY_MAX));

      if (
        window.innerHeight + window.scrollY >=
        document.body.scrollHeight - 10
      ) {
        return;
      }
    }
  }

  // Ожидание загрузки следующей страницы в SPA и перезапуск
  function waitForNextPageAndRestart() {
    const target = document.querySelector('div[data-qa="vacancy-serp__results"]');
    if (!target) return;

    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      observer.disconnect();
      shouldStop = false;

      setTimeout(() => {
        startSearchPage();
      }, rand(1200, 2500));
    });

    observer.observe(target, { childList: true });
  }

  async function clickNext() {
    if (sessionExpired()) {
      shouldStop = true;
      updateStatus(`⏹️ Done<br>Pages: ${pagesVisited}`, "#666");
      
      // Очищаем данные сессии
      GM_setValue("shouldContinue", false);
      GM_setValue("sessionStart", 0);
      GM_setValue("pagesVisited", 0);
      GM_setValue("nextVacancyIndex", 0);
      GM_setValue("totalVacancies", 0);
      return;
    }

    const btn = document.querySelector('a[data-qa="pager-next"]');
    if (!btn) {
      updateStatus("🏁 Last page", "#c00");
      return;
    }

    pagesVisited++;
    GM_setValue("pagesVisited", pagesVisited);

    updateStatus(`📄 Page ${pagesVisited}/${pageLimit}`, "#2196F3");

    GM_setValue("shouldContinue", true);
    GM_setValue("timestamp", Date.now());

    waitForNextPageAndRestart();
    btn.click();
  }

  // Безопасно кликнуть на вакансию (с плавным скроллом к элементу)
  async function clickVacancyElement(vacancyDiv) {
    try {
      // Получаем позицию элемента
      const rect = vacancyDiv.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2);
      const currentY = window.scrollY;
      const distance = targetY - currentY;
      
      console.log('[HH Auto] Scrolling to vacancy element...');
      
      // Плавно скроллим к элементу человекоподобными шагами
      if (Math.abs(distance) > 100) { // Скроллим только если элемент далеко
        const slowdownFactor = rand(2, 3); // Замедление в 2-3 раза
        const steps = Math.ceil(Math.abs(distance) / rand(80, 150));
        const stepSize = distance / steps;
        
        for (let i = 0; i < steps; i++) {
          window.scrollBy(0, stepSize);
          await sleep(rand(30, 80) * slowdownFactor); // Медленнее в 2-3 раза
        }
        
        // Небольшая пауза после скролла
        await sleep(rand(500, 1000));
      }
      
      console.log('[HH Auto] Clicking vacancy element:', vacancyDiv);
      
      // Кликаем на div
      vacancyDiv.click();
      
      // Проверяем через небольшую задержку, сработал ли переход
      await sleep(1000);
      
      // Если мы всё ещё на странице поиска, пробуем альтернативный способ
      if (!isVacancyPage()) {
        console.warn('[HH Auto] Click didnt navigate, trying link click');
        const link = vacancyDiv.querySelector('a[data-qa="serp-item__title"]') ||
                     vacancyDiv.querySelector('a[href*="/vacancy/"]');
        
        if (link && link.href) {
          console.log('[HH Auto] Navigating to:', link.href);
          window.location.href = link.href;
        }
      }
      
      return true;
    } catch (error) {
      console.error('[HH Auto] Error clicking vacancy:', error);
      return false;
    }
  }

  async function startSearchPage() {
    updateStatus(
      `▶️ Session ~${Math.round(
        sessionLimit / 60000
      )} min<br>Pages ≤ ${pageLimit}`,
      "#4CAF50"
    );

    // Проверяем, есть ли незавершённые вакансии
    const nextIndex = GM_getValue("nextVacancyIndex", 0);
    const total = GM_getValue("totalVacancies", 0);

    // Если есть незавершённые вакансии, продолжаем открывать
    if (nextIndex > 0 && nextIndex < total) {
      updateStatus(
        `🔄 Continuing (${nextIndex}/${total} opened)`,
        "#9C27B0"
      );
      
      await sleep(rand(800, 1500));
      
      // Получаем все вакансии заново (после history.back())
      const allVacancies = Array.from(
        document.querySelectorAll('div[data-qa="vacancy-serp__vacancy"]')
      );

      if (allVacancies.length > nextIndex) {
        updateStatus(
          `📂 Opening vacancy ${nextIndex + 1}/${total}`,
          "#9C27B0"
        );
        
        // Сохраняем URL текущей страницы поиска
        GM_setValue("searchPageUrl", window.location.href);
        GM_setValue("nextVacancyIndex", nextIndex + 1);
        
        await clickVacancyElement(allVacancies[nextIndex]);
        return; // Переход на страницу вакансии
      }
    }

    // Если вакансии закончились или их не было, очищаем счётчики
    GM_setValue("nextVacancyIndex", 0);
    GM_setValue("totalVacancies", 0);

    // Если это первый заход на страницу (нет незавершённых вакансий)
    // то выбираем и начинаем открывать новые вакансии
    if (nextIndex === 0) {
      const vacancies = getRandomVacancies();
      
      if (vacancies.length > 0) {
        updateStatus(`🔍 Selected ${vacancies.length} vacancies`, "#9C27B0");
        
        // Сохраняем URL текущей страницы поиска
        GM_setValue("searchPageUrl", window.location.href);
        GM_setValue("nextVacancyIndex", 1);
        GM_setValue("totalVacancies", vacancies.length);
        
        await clickVacancyElement(vacancies[0]);
        return; // Переход на страницу вакансии
      }
    }

    // Все вакансии открыты или их нет - продолжаем обычный скролл
    updateStatus("📜 Scrolling to bottom...", "#4CAF50");
    await scrollToBottom();
    await clickNext();
  }

  function init() {
    createStatus();

    if (isVacancyPage()) {
      // Мы на странице вакансии
      setTimeout(() => handleVacancyPage(), rand(800, 1500));
    } else {
      // Мы на странице поиска
      setTimeout(() => startSearchPage(), rand(1200, 2500));
    }
  }

  init();
})();
