// ==UserScript==
// @name          AniList Unlimited - Move and Format Genres and Tags
// @namespace     Kellen's userstyles
// @version       1.13.1
// @description   For anilist.co, move and format genres and tags to the header, and display romaji and english titles.
// @author        kln (t.me/kln_lzt)
// @homepageURL   https://github.com/Kellenok/userscipts/
// @supportURL    https://github.com/Kellenok/userscipts/issues
// @match         https://anilist.co/*
// @grant         none
// @license       MIT
// ==/UserScript==

(function () {
    'use strict';

    /**
     * Constants for this user script.
     */
    const constants = {
        /** Regex to extract the page type and media id from a AniList url path */
        ANI_LIST_URL_PATH_REGEX: /(anime|manga)\/([0-9]+)/i,

        /** Prefix message for logs to the console */
        LOG_PREFIX: '[AniList Unlimited User Script]',

        /** Prefix for class names added to created elements (prevent conflicts) */
        CLASS_PREFIX: 'user-script-ani-list-unlimited',

        /** Title suffix added to created elements (for user information) */
        CUSTOM_ELEMENT_TITLE:
            '(this content was added by the ani-list-unlimited user script)',

        /** Maximum number of tags to show initially */
        MAX_TAGS_VISIBLE: 10,

        /** When true, output additional logs to the console */
        DEBUG: false,
        SEPERATOR: ' · ',
        SPOILER_TAG_SELECTOR: '.spoiler-toggle',

        SHOW_MORE_TEXT: ' more',
        COLLAPSE_TEXT: 'Collapse',
    };

    /**
     * Utility functions.
     */
    const utils = {
        /**
         * Logs an error message to the console.
         *
         * @param {string} message - The error message.
         * @param  {...any} additional - Additional values to log.
         */
        error(message, ...additional) {
            console.error(`${constants.LOG_PREFIX} Error: ${message}`, ...additional);
        },

        /**
         * Logs a debug message which only shows when constants.DEBUG = true.
         *
         * @param {string} message The message.
         * @param  {...any} additional - ADditional values to log.
         */
        debug(message, ...additional) {
            if (constants.DEBUG) {
                console.debug(`${constants.LOG_PREFIX} ${message}`, ...additional);
            }
        },

        /**
         * Waits for an element to load.
         *
         * @param {string} selector - Wait for the element matching this
         * selector to be found.
         * @param {Element} [container=document] - The root element for the
         * selector, defaults to `document`.
         * @param {number} [timeoutSecs=7] - The number of seconds to wait
         * before timing out.
         *
         * @returns {Promise<Element>} A Promise returning the DOM element, or a
         * rejection if a timeout occurred.
         */
        async waitForElement(selector, container = document, timeoutSecs = 7) {
            const element = container.querySelector(selector);
            if (element) {
                return Promise.resolve(element);
            }

            return new Promise((resolve, reject) => {
                const timeoutTime = Date.now() + timeoutSecs * 1000;

                const handler = () => {
                    const element = container.querySelector(selector);
                    if (element) {
                        resolve(element);
                    } else if (Date.now() > timeoutTime) {
                        reject(new Error(`Timed out waiting for selector '${selector}'`));
                    } else {
                        setTimeout(handler, 100);
                    }
                };

                setTimeout(handler, 1);
            });
        },

        /**
         * Waits for an element to load.
         *
         * @param {string} selector - Wait for the element matching this
         * selector to be found.
         * @param {Element} [container=document] - The root element for the
         * selector, defaults to `document`.
         * @param {string} text - The text content the element needs to have.
         * @param {number} [timeoutSecs=7] - The number of seconds to wait
         * before timing out.
         *
         * @returns {Promise<Element>} A Promise returning the DOM element, or a
         * rejection if a timeout occurred.
         */
        async waitForElementWithText(selector, container = document, text, timeoutSecs = 7) {

            return new Promise((resolve, reject) => {
                const timeoutTime = Date.now() + timeoutSecs * 1000;
                const handler = () => {
                    const elements = container.querySelectorAll(selector);
                    let element = null;
                    for (const el of elements) {
                        if (el.textContent.trim() === text) {
                            element = el;
                            break;
                        }
                    }
                    if (element) {
                        resolve(element);
                    } else if (Date.now() > timeoutTime) {
                        reject(new Error(`Timed out waiting for selector '${selector}' with text '${text}'`));
                    } else {
                        setTimeout(handler, 100);
                    }
                };

                setTimeout(handler, 1);
            });
        },
        /**
         * Removes all children from a given DOM element.
         * @param {HTMLElement} element
         */
        clearElement(element) {
            while (element.firstChild) {
                element.removeChild(element.firstChild)
            }
        }
    };

    /**
     * Handles manipulating the current AniList page.
     */
    class AniListPage {
        constructor() {
            this.selectors = {
                pageTitle: 'head > title',
                header: '.page-content .header .content',
                headerContainer: '.page-content .header .container',
                sidebar: '.page-content .sidebar',
                genresContainer: '.data-set.data-list .type',
                tagsContainer: '.tags',
                tagItem: '.tag',
                genreItem: '.data-set.data-list .value a',
                pageBanner: '.page-content .container .banner',
                pageContent: '.page-content',
                pageContainer: '.page-content .header .container',
                romajiTitle: '.data-set .type',
                englishTitle: '.data-set .type',
                h1Title: '.page-content .header .content h1',
                coverWrap: '.page-content .header .cover-wrap',
                content: '.page-content .header .content',
            };
            this.headerCache = null;
            this.lastCheckedUrlPath = null;
        }

        /**
         * Initialize the page and apply page modifications.
         */
        initialize() {
            utils.debug('initializing page');
            this.applyPageModifications().catch(e =>
                utils.error(`Unable to apply modifications to the page - ${e.message}`)
            );

            // eslint-disable-next-line no-unused-vars
            const observer = new MutationObserver((mutations, observer) => {
                utils.debug('mutation observer', mutations);
                this.applyPageModifications().catch(e =>
                    utils.error(
                        `Unable to apply modifications to the page - ${e.message}`
                    )
                );
            });

            const target = document.querySelector(this.selectors.pageTitle);
            observer.observe(target, { childList: true, characterData: true });
        }

        /**
         * Applies modifications to the page based on config settings.
         *
         * This will only add content if we are on a relevant page in the app.
         */
        async applyPageModifications() {
            const pathname = window.location.pathname;
            utils.debug('checking page url', pathname);

            if (this.lastCheckedUrlPath === pathname) {
                utils.debug('url path did not change, skipping');
                return;
            }
            this.lastCheckedUrlPath = pathname;

            const matches = constants.ANI_LIST_URL_PATH_REGEX.exec(pathname);
            if (!matches) {
                utils.debug('url did not match');
                return;
            }
            const pageType = matches[1];
            utils.debug('pageType:', pageType);

            await this.moveAndFormatGenresAndTags();
            await this.moveAndFormatTitles();
            this.fixGrid();
            this.moveBanner();
        }

        async moveAndFormatGenresAndTags() {
            try {
                const headerEl = await utils.waitForElement(this.selectors.header);
                const sidebarElement = await utils.waitForElement(this.selectors.sidebar);
                const genresContainer = await utils.waitForElementWithText(this.selectors.genresContainer, sidebarElement, "Genres");
                const genres = genresContainer.parentElement;
                const tagsContainer = await utils.waitForElement(this.selectors.tagsContainer, sidebarElement);

                const insertionPoint =
                    headerEl.querySelector('h1') || headerEl.firstElementChild;

                const containerClass = `${constants.CLASS_PREFIX}-genres-tags`;
                let containerEl = headerEl.querySelector(`.${containerClass}`);
                if (!containerEl) {
                    containerEl = document.createElement('div');
                    containerEl.className = containerClass;
                    containerEl.style.display = 'flex';
                    containerEl.style.flexDirection = 'column';
                    containerEl.style.marginTop = '2em';
                    containerEl.style.alignItems = 'flex-start';

                    insertionPoint.insertAdjacentElement('afterend', containerEl);
                } else {
                    utils.clearElement(containerEl);
                }


                if (genres) {
                    const genreList = genres.querySelectorAll(this.selectors.genreItem)


                    const formattedGenres = document.createElement('div');
                    formattedGenres.title = `Genres ${constants.CUSTOM_ELEMENT_TITLE}`;
                    formattedGenres.style.marginBottom = '0.5em'

                    genreList.forEach(genreLink => {
                        const genreWrapper = document.createElement('span');
                        const genreText = genreLink.textContent.trim()
                        genreWrapper.style.fontWeight = 'bold';
                        const genreLinkClone = genreLink.cloneNode(true);
                        genreLinkClone.textContent = genreText
                        genreWrapper.appendChild(genreLinkClone)

                        formattedGenres.appendChild(genreWrapper);
                        if (genreLink !== genreList[genreList.length - 1]) {
                          formattedGenres.append(constants.SEPERATOR)
                        }
                    })
                    containerEl.appendChild(formattedGenres);
                }

                if (tagsContainer) {
                    const tagElements = Array.from(tagsContainer.querySelectorAll(this.selectors.tagItem));
                    const formattedTags = document.createElement('div');
                    formattedTags.title = `Tags ${constants.CUSTOM_ELEMENT_TITLE}`;
                    formattedTags.style.display = 'flex';
                    formattedTags.style.flexWrap = 'wrap';
                    formattedTags.style.fontSize = '0.85em';
                    formattedTags.style.columnGap = '1em';
                    formattedTags.style.rowGap = '0.5em';

                    const visibleTags = [];
                    const hiddenTags = [];

                    tagElements.forEach((tagElement, index) => {
                        const nameLink = tagElement.querySelector('a.name');
                        const rankElement = tagElement.querySelector('.rank');
                        if (!nameLink || !rankElement) {
                            return;
                        }
                        const name = nameLink.textContent.trim();
                        const rank = rankElement.textContent.trim();

                        const tagSpan = document.createElement('span');
                        const isSpoiler = tagElement.closest(constants.SPOILER_TAG_SELECTOR) !== null;

                        const tagLinkClone = nameLink.cloneNode(true);
                        tagLinkClone.textContent = name;
                        const rankSpan = document.createElement('span');
                        rankSpan.textContent = constants.SEPERATOR + rank;
                        rankSpan.classList.add(`${constants.CLASS_PREFIX}-tag-rank`);

                        tagSpan.appendChild(tagLinkClone);
                        tagSpan.appendChild(rankSpan);

                        if (isSpoiler) {
                            tagSpan.classList.add(`${constants.CLASS_PREFIX}-spoiler-tag`);
                        }

                        if (index < constants.MAX_TAGS_VISIBLE) {
                            visibleTags.push(tagSpan);
                        } else {
                            tagSpan.classList.add(`${constants.CLASS_PREFIX}-hidden-tag`);
                            hiddenTags.push(tagSpan);
                        }
                    });
                    visibleTags.forEach(tag => formattedTags.appendChild(tag))

                    let showMoreButton = null;
                    if (hiddenTags.length > 0) {
                        showMoreButton = document.createElement('span');
                        showMoreButton.textContent = `${hiddenTags.length}${constants.SHOW_MORE_TEXT}`;
                        showMoreButton.classList.add(`${constants.CLASS_PREFIX}-show-more-tags`, `${constants.CLASS_PREFIX}-tag-rank`);
                        let isExpanded = false;

                        showMoreButton.addEventListener('click', () => {

                            isExpanded = !isExpanded;
                            if (isExpanded) {
                                hiddenTags.forEach(tag => {
                                    tag.classList.remove(`${constants.CLASS_PREFIX}-hidden-tag`);
                                    tag.classList.add(`${constants.CLASS_PREFIX}-visible-tag`);
                                    formattedTags.appendChild(tag);
                                });
                                formattedTags.appendChild(showMoreButton);
                                showMoreButton.textContent = constants.COLLAPSE_TEXT;
                            } else {
                                hiddenTags.forEach(tag => {
                                    tag.classList.add(`${constants.CLASS_PREFIX}-hidden-tag`);
                                    tag.classList.remove(`${constants.CLASS_PREFIX}-visible-tag`)
                                    formattedTags.insertBefore(tag, showMoreButton)

                                });
                                showMoreButton.textContent = `${hiddenTags.length}${constants.SHOW_MORE_TEXT}`;
                            }
                        });
                        formattedTags.appendChild(showMoreButton);

                        hiddenTags.forEach(tag => {
                            formattedTags.insertBefore(tag, showMoreButton);
                        })
                        hiddenTags.forEach(tag => tag.classList.add(`${constants.CLASS_PREFIX}-hidden-tag`))

                    }
                    containerEl.appendChild(formattedTags)
                }
            } catch (error) {
                utils.error("Unable to move or format genres or tags: ", error);
            }
        }
        async moveAndFormatTitles() {
            try {
                const headerContainer = await utils.waitForElement(this.selectors.headerContainer)
                const sidebarElement = await utils.waitForElement(this.selectors.sidebar);
                const h1Title = await utils.waitForElement(this.selectors.h1Title, headerContainer)

                const romajiTitleContainer = await utils.waitForElementWithText(this.selectors.romajiTitle, sidebarElement, "Romaji");
                const englishTitleContainer = await utils.waitForElementWithText(this.selectors.englishTitle, sidebarElement, "Native");

                const romajiTitle = romajiTitleContainer.nextElementSibling.textContent.trim();
                const englishTitle = englishTitleContainer.nextElementSibling.textContent.trim();

                const containerClass = `${constants.CLASS_PREFIX}-titles`;
                let containerEl = headerContainer.querySelector(`.${containerClass}`);
                if (!containerEl) {
                    containerEl = document.createElement('div');
                    containerEl.className = containerClass;
                    containerEl.style.gridArea = 'header';
                    containerEl.style.zIndex = '2'


                    headerContainer.insertBefore(containerEl, headerContainer.firstChild);
                } else {
                    utils.clearElement(containerEl);
                }

                const formattedTitles = document.createElement('div');
                formattedTitles.title = `Titles ${constants.CUSTOM_ELEMENT_TITLE}`;
                formattedTitles.style.display = 'flex';
                formattedTitles.style.flexDirection = 'column';
                formattedTitles.style.gap = '0.3em';
                formattedTitles.style.marginTop = '40px';
                formattedTitles.style.color = 'rgb(var(--color-gray-600))';
                formattedTitles.style.height = '4.5em';
                formattedTitles.style.justifyContent = 'flex-end';


                const romajiTitleSpan = document.createElement('span');
                romajiTitleSpan.style.color = 'rgb(var(--color-gray-800))';
                romajiTitleSpan.style.fontWeight = '800';
                romajiTitleSpan.style.fontSize = '2rem';
                romajiTitleSpan.style.letterSpacing = '0.03em';
                romajiTitleSpan.style.fontFamily = "'Overpass'";

                romajiTitleSpan.textContent = romajiTitle;
                const englishTitleSpan = document.createElement('span');
                englishTitleSpan.textContent = englishTitle;

                formattedTitles.appendChild(romajiTitleSpan)
                formattedTitles.appendChild(englishTitleSpan)


                containerEl.appendChild(formattedTitles)
                h1Title.style.display = 'none'


            } catch (error) {
                utils.error("Unable to move or format titles: ", error);
            }
        }

        fixGrid() {
            try {
                const container = document.querySelector(this.selectors.pageContainer);
                const coverWrap = document.querySelector(this.selectors.coverWrap);
                const content = document.querySelector(this.selectors.content);


                container.style.display = 'grid';
                container.style.gridColumnGap = '30px';
                container.style.gridTemplateColumns = '215px 1fr auto';
                container.style.gridTemplateAreas = '"cover header rates" "cover content content"';

                coverWrap.style.gridArea = 'cover';
                coverWrap.style.zIndex = '2';
                coverWrap.style.marginTop = '16px';
                content.style.gridArea = 'content';
                content.style.paddingTop = "0px"
            }
            catch (error) {
                utils.error("Unable to fix grid: ", error)
            }

        }
    }

    // execution:

    const page = new AniListPage();
    page.initialize();

    const style = document.createElement('style');
    style.textContent = `
        .${constants.CLASS_PREFIX}-spoiler-tag {
           filter: blur(4px);
           transition: all 0.3s cubic-bezier(0.000, 0.000, 0.230, 1);
        }
       .${constants.CLASS_PREFIX}-spoiler-tag:hover {
            filter: none;
       }
       .${constants.CLASS_PREFIX}-tag-rank {
           font-weight: lighter;
           opacity: 0.7;
       }

        .${constants.CLASS_PREFIX}-hidden-tag {
            display: none;
        }
       .${constants.CLASS_PREFIX}-show-more-tags {
            cursor: pointer;
             display: inline-flex;
            align-items: center;
             white-space: nowrap;
            margin-bottom: 0.5em;
        }
        .${constants.CLASS_PREFIX}-show-more-tags:hover {
            text-decoration: underline;
        }
        .media-page-unscoped.media-manga .banner::before,
        .media-page-unscoped.media-anime .banner::before {
             content: '';
            z-index: 10;
            width: 100%;
            height: 100%;
            display: block;
             background: linear-gradient(0deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0) 50%);
       }

       .media-page-unscoped.media-manga .banner,
       .media-page-unscoped.media-anime .banner {
            margin-bottom: -8em;
            z-index: 1;
            position: relative;
        }

        .media-page-unscoped.media-manga .header-wrap .shadow,
.media-page-unscoped.media-anime .header-wrap .shadow{
            display: none;
        }

        `;
    document.head.appendChild(style);
})();
