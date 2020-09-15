/**** TODO LIST ****/
// TODO Check that we have added icons for all itemTypes
// TODO Functionise a bit more - a lot of work done in ou_getModules to avoid having multiple for loops steping through Modules/Items
// TODO Check that we haven't lost any of Canvas's accessibility features
// TODO investigate whether we could limit Module titles in LH menu to e.g two lines
// TODO can we refresh menu when editing Modules?

(async function () {  //method from: https://community.canvaslms.com/thread/22500-mobile-javascript-development

    /****************************************/
    /**** Start of Configuration Section ****/
    /****************************************/

    /* Amazon S3 bucket URL, this URL is needed to retrieve the course presentation and navigation settings */
    const amazonS3bucketUrl = `https://oxctl-modules.s3-eu-west-1.amazonaws.com`;

    const noOfColumnsPerRow = 4;  //no of columns per row of tiles at top of Modules page - 1, 2, 3, 4, 6 or 12 - ONLY USE 4 for the moment
    /* colours for Module tiles mostly randomly selected from: https://www.ox.ac.uk/public-affairs/style-guide/digital-style-guide */
    const moduleColours = [
        '#e8ab1e','#91b2c6','#517f96','#1c4f68',
        '#400b42','#293f11','#640D14','#b29295',
        '#002147','#cf7a30','#a79d96','#aab300',
        '#872434','#043946','#fb8113','#be0f34',
        '#a1c4d0','#122f53','#0f7361','#3277ae',
        '#44687d','#517fa4','#177770','#be0f34',
        '#d34836','#70a9d6','#69913b','#d62a2a',
        '#5f9baf','#09332b','#44687d','#721627',
        '#9eceeb','#330d14','#006599','#cf7a30',
        '#a79d96','#be0f34','#001c3d','#ac48bf',
        '#9c4700','#c7302b','#ebc4cb','#1daced'
    ];

    // var showItemLinks = 1; //whether or not to show drop-down links to items within Modules in tiles NOTE: Currently disabled - need to read this: https://www.w3.org/WAI/tutorials/menus/application-menus-code/ for how to do it accessibly

    const widthOfButton = 42;  //width of a Progress bar button //TODO - calculate this
    const widthOfCentreColPadding = 72; //used to calculate whether enough room to show Progress bar buttons //TODO - calculate this
    // const widthOfPositionWords = 134; //used to calculate whether enough room to show Progress bar buttons //TODO - calculate this
    const allowMultilineModuleTitles = false; //whether to allow LH menu Module links to be multiline

    /* DOM elements to check for */
    // The structure hierarchy in Canvas is content > course_home_content > context_modules_sortable_container
    const divCourseHomeContent = document.getElementById('course_home_content');  //is this page Home
    const divContent = document.getElementById('content');
    const divContextModulesContainer = document.getElementById('context_modules_sortable_container');  //are we on the Modules page

    // Contains the Modules link in the LHS Menu (left hand side).
    // This doesn't match if the modules page is hidden for the students.
    // Gets the modules link by class, more optimal than the text content if the course language is not english <a class='modules' href="xxx"/>
    const lhsModulesLink = document.querySelector('li.section a.modules');
    const lhsModulesListItem = lhsModulesLink ? lhsModulesLink.parentNode : null

    /* Working out and storing where we are in Course */
    var moduleIdByModuleItemId = []; //used to store moduleIds using the ModuleItemId (as shown in url for pages, etc) so we can show active sub-modules {moduleId: x, moduleName: x, progress: x}

    /* Context variables */
    const initCourseId = ou_getCourseId();  //which course are we in ONLY WORKS ON WEB
    const initDomainId = ou_getDomainRootAccountId(); // The domain ID.
    const initModuleItemId = ou_getModuleItemId();  //0 or module_item_id from URL (ie only if launched through Modules)
    const initModuleId = ou_getModuleId();  //0 or module being viewed within Modules page

    /****************************************/
    /**** End of Configuration Section ******/
    /****************************************/

    /****************************************/
    /***** Start function main thread *******/
    /****************************************/

    // We must abort if the script cant get the initCourseId or the initDomainId.
    if (!initCourseId || !initDomainId) {
      return;
    }

    const isTileViewEnabled = await ou_CheckSettings(initDomainId, initCourseId);
    // Only perform the course presentation and navigation logic if it is enabled in the course CPN settings.
    if (!isTileViewEnabled) {
      return;
    }

    // We're inside a specific modules, hide the other Modules
    if (initModuleId) {
        ou_hideOtherModules(initModuleId);
    }

    const courseModules = await ou_getModules(initCourseId);
    const isCourseHome = divContextModulesContainer && !initModuleId && divCourseHomeContent;
    // If the user is in the course home and contains modules, replace the standard view by the tile view.
    if (isCourseHome) {
      ou_replaceStandardByTileView(courseModules, divContent, divCourseHomeContent);
    }

    // Add the submenu of modules to the LHS menu if the modules list item is visible.
    if (lhsModulesListItem) {
      ou_buildModulesSubmenu(courseModules, lhsModulesListItem, initCourseId, initModuleId, initModuleItemId, allowMultilineModuleTitles);
    }

    if (initModuleItemId) {
      const currentModule = courseModules.find(module => module.items.find(moduleItem => moduleItem.id === parseInt(initModuleItemId)));
      const moduleItemsForProgress = ou_getModuleItemsForProgress(currentModule);
      // TODO: This is buggy and doesnt look like a good approach, replace by a better approach.
      setTimeout(ou_buildProgressBar(moduleItemsForProgress), 100);
    }


    /****************************************/
    /***** End function main thread *********/
    /****************************************/

    /****************************************/
    /***** Start of function definitions ****/
    /****************************************/

    /*
     * Checks if the CPN view is enabled requesting the CPN settings from the Amazon S3 bucket.
     */
    async function ou_CheckSettings(initDomainId, initCourseId) {
      const settingsFileRequestUrl = `${amazonS3bucketUrl}/${initDomainId}/${initCourseId}.json`;
      const isTileViewEnabled = await fetch(settingsFileRequestUrl)
        .then(ou_json)
        .then(function(json) {
            const isTileViewEnabled = json['modules-navigation'];
            console.log('Modules Navigation Enabled: ' + isTileViewEnabled);
            return isTileViewEnabled;
        })
        .catch(function(error) {
            console.log('Failed to load settings');
            return false;
        });
        return isTileViewEnabled;
    }

    /*
     * Gets the module objects for a courseId querying the Canvas API.
     * https://canvas.instructure.com/doc/api/modules.html#Module
     */
    async function ou_getModules(courseId) {
      // Added &per_page=100, otherwise only returns the first 10
      const moduleRequest = `/api/v1/courses/${courseId}/modules?include=items&per_page=100`;
      const courseModules = await fetch(moduleRequest, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        }
      }).then(ou_status)
      .then(ou_json)
      .then((moduleArray) => {return moduleArray;})
      .catch(function(error) {
        console.log('Failed to get course modules', error);
        return [];
      });
      return courseModules
    }

    /*
     * Replaces the standard view of the course home modules by the tile view.
     */
    function ou_replaceStandardByTileView(moduleArray, contentDiv, homeContentDiv) {
      // Hide the current home content div.
      homeContentDiv.style.display = 'none';

      const moduleNavId = 'module_nav';
      //First delete any existing nav container
      let existingModuleNav = document.getElementById(moduleNavId);
      if (existingModuleNav) {
          existingModuleNav.parentNode.removeChild(existingModuleNav);
      }
      //Create our nav container
      let moduleNav = document.createElement('div');
      moduleNav.id = moduleNavId;
      moduleNav.className = 'ou-ModuleCard__box';
      moduleNav.innerHTML = '<a id="module_nav_anchor"></a>';
      // Insert moduleNav onto page
      contentDiv.insertBefore(moduleNav, contentDiv.childNodes[0]);

      let newRow;
      moduleArray.forEach((module, mindex) => {
        //create row for card
        if (mindex % noOfColumnsPerRow === 0) {
            newRow = document.createElement('div');
            newRow.className = 'grid-row center-sm';
            moduleNav.appendChild(newRow);
        }

        var newColumn = document.createElement('div');

        // create column wrapper
        newColumn.className = 'col-xs-12 col-sm-6 col-lg-3'; //TODO work out classes for noOfColumnsPerRow != 4
        newRow.appendChild(newColumn);

        //create module div
        let moduleTile = document.createElement('div');
        moduleTile.className = 'ou-ModuleCard';
        moduleTile.title = module.name;

        let moduleTileLink = document.createElement('a');
        moduleTileLink.href = `/courses/${initCourseId}/modules/${module.id}`;

        let moduleTileHeader = document.createElement('div');
        moduleTileHeader.className = 'ou-ModuleCard__header_hero_short';
        moduleTileHeader.style.backgroundColor = moduleColours[mindex];

        let moduleTileContent = document.createElement('div');
        moduleTileContent.className = 'ou-ModuleCard__header_content';

        var moduleTileTitle = document.createElement('div');
        moduleTileTitle.classList.add('ou-ModuleCard__header-title');
        moduleTileTitle.classList.add('ellipsis');
        moduleTileTitle.title = module.name;
        moduleTileTitle.style.color = moduleColours[mindex];
        moduleTileTitle.innerHTML = module.name;

        // Only leave space for actions if we're adding them
        moduleTileTitle.classList.add('ou-no-actions');

        moduleTileContent.appendChild(moduleTileTitle);
        moduleTileLink.appendChild(moduleTileHeader);
        moduleTileLink.appendChild(moduleTileContent);
        moduleTile.appendChild(moduleTileLink);
        newColumn.appendChild(moduleTile);

      });

    }

    /*
     * Builds the modules submenu adding all the modules as children of the Modules tool.
     */
    function ou_buildModulesSubmenu(moduleArray, moduleListItem, courseId, moduleId, moduleItemId, allowMultipleModuleTitles) {
      // The containing element for the modules sub-menu
      let moduleSubmenuList = document.createElement('ul');
      moduleSubmenuList.className = 'ou-section-tabs-sub';

      moduleArray.forEach((module, mindex) => {
        // Create a new item for the submodule list.
        let newItem = document.createElement('li');
        newItem.className = 'ou-section-sub';

        // Create a new Link for the submodule item.
        let newLink = document.createElement('a');
        newLink.className = 'ou-section-link-sub';
        newLink.title = module.name;
        newLink.href = `/courses/${courseId}/modules/${module.id}`;
        newLink.innerHTML = module.name;
        if (allowMultipleModuleTitles) {
            newLink.classList.add('ou-multiline');
        }

        // Check if the moduleItemId belongs to this module.
        const currentModuleItem = module.items.find(item => item.id === parseInt(moduleItemId))
        // Check if we need to make one of our sub-menu modules active
        if (module.id === parseInt(moduleId) || currentModuleItem) {
            // Remove the 'active' class of the current menu option.
            const activeOptionMenu = document.querySelector('li.section > a.active');
            activeOptionMenu.classList.remove('active');
            // Make the current Module active
            newLink.classList.add('active');
        }

        // Append the link to the submenu item.
        newItem.appendChild(newLink);
        // Append the submenu item to the submenu list.
        moduleSubmenuList.appendChild(newItem);
      });

      moduleListItem.appendChild(moduleSubmenuList);

    }

    function ou_getModuleItemsForProgress(currentModule) {
      let moduleItemsForProgress = [];

      currentModule.items.forEach(item => {
          //don't want these represented anywhere - on Modules tiles dropdowns OR in progress buttons
          if (item.type === 'SubHeader') {
            return;
          }

          let itemId = item.id;
          let itemType = item.type;
          let iconType = ou_getItemTypeIcon(itemType);

          const listItemDest = `/courses/${initCourseId}/modules/items/${itemId}`;
          // note only want to do this for current module
          let isCurrentItem = parseInt(initModuleItemId) == parseInt(item.id);
          let itemNavObject = {
              href: listItemDest,
              title: item.title,
              icon: iconType,
              current: isCurrentItem
          };

          moduleItemsForProgress.push(itemNavObject);

        });

        return moduleItemsForProgress;

    }

    /*
     * Function which builds progress bar between Next and Previous buttons IF item shown as part of Module
     */
    function ou_buildProgressBar(moduleItemsForProgress) {
        const divFooterContent = document.getElementsByClassName('module-sequence-footer-content')[0];
        if (!divFooterContent) {
          return;
        }

        // Now create flexible divs to pop progress bar and next and previous buttons into
        // 1. Ceate div with one flexible and two inflexible divs at either end
        let divColContainer = document.createElement('div');
        divColContainer.classList.add('ou-ColContainer');
        // Left col will contain the previous button if exists.
        let divLeftCol = document.createElement('div');
        divLeftCol.classList.add('ou-LeftCol');
        // Centre col will contain the module item links.
        let divCentreCol = document.createElement('div');
        divCentreCol.classList.add('ou-CentreCol');
        // Right col will contain the next button if exists
        let divRightCol = document.createElement('div');
        divRightCol.classList.add('ou-RightCol');

        // 2. Move buttons if present - awkwardly, pevious is just a link and next sits in span -  into the two inflexible ends
        divColContainer.appendChild(divLeftCol);
        divColContainer.appendChild(divCentreCol);
        divColContainer.appendChild(divRightCol);

        // 3. Place the existing navigation buttons into the right and left columns
        // Look for Previous button
        const previousButton = document.querySelector('a.module-sequence-footer-button--previous');
        if (previousButton) {
            divLeftCol.appendChild(previousButton);
        }
        // Look for Next button
        const nextButton = document.querySelector('span.module-sequence-footer-button--next');
        if (nextButton) {
            divRightCol.appendChild(nextButton);
        }

        // Create individual progress buttons version
        let divProgressIcons = document.createElement('div');
        divProgressIcons.className = 'ou-progress-icons';
        let divProgressItems = document.createElement('ul');
        divProgressItems.className = 'ou-progress-items';

        moduleItemsForProgress.forEach(item => {
            let listItem = document.createElement('li');
            let listItemLink = document.createElement('a');
            listItem.className = 'ou-progress-item';
            listItemLink.classList.add(item.icon);
            if (item.current) {
                listItemLink.classList.add('active');
            }
            listItemLink.href = item.href;
            listItemLink.setAttribute('role', 'menuitem');
            listItemLink.title = item.title;
            // Add the link to the item
            listItem.appendChild(listItemLink);
            // Add the item to the list of items
            divProgressItems.appendChild(listItem);
        });

        // Add the list of items to the items DIV
        divProgressIcons.appendChild(divProgressItems);
        // Add the items DIV to the centre column
        divCentreCol.appendChild(divProgressIcons);

        // 4. Place new progressBarContainer in the middle flexible div
        divFooterContent.appendChild(divColContainer);

    }

    /*
     * Hides all the modules except the module which id is the function's argument.
     */
    function ou_hideOtherModules(moduleId) {
      var otherModuleDivs = document.querySelectorAll(`div.context_module:not([data-module-id='${moduleId}'])`);
      otherModuleDivs.forEach(module => module.style.display = 'none');
    }

    /*
     * Function which returns a promise (and error if rejected) if response status is OK
     * @param {Object} response
     * @returns {Promise} either error or response
     */
    function ou_status(response) {
        if (response.status >= 200 && response.status < 300) {
            return Promise.resolve(response);
        } else {
            return Promise.reject(new Error(response.statusText));
        }
    }

    /*
     * Function which returns json from response
     * @param {Object} response
     * @returns {string} json from response
     */
    function ou_json(response) {
        return response.json();
    }

    /**
     * Gets the domain root account ID.
     */
    function ou_getDomainRootAccountId() {
        return ENV.DOMAIN_ROOT_ACCOUNT_ID;
    }

    /**
     * Function which gets find course id from wherever it is available - currently ONLY ON WEB
     * @returns {string} id of course
     */
    function ou_getCourseId() {
        var courseId = ENV.COURSE_ID || ENV.course_id;
        if (!courseId) {
            var urlPartIncludingCourseId = window.location.href.split('courses/')[1];
            if (urlPartIncludingCourseId) {
                courseId = urlPartIncludingCourseId.split('/')[0];
            }
        }
        return courseId;
    }

    /**
     * Function which gets find module_item_id from URL - currently ONLY ON WEB
     * @returns {int} id of module_item or 0 for not found
     */
    function ou_getModuleItemId() {
        const moduleRequestUrl = new URL(window.location.href);
        const moduleRequestParams = new URLSearchParams(moduleRequestUrl.search);
        // Get the module item id from the request
        const moduleItemId = moduleRequestParams.get('module_item_id');
        // If the module item id is in the request, return it.
        // Otherwise return 0
        return moduleItemId ? moduleItemId : 0;
    }

    /**
     * Function which finds the module id from location hash - currently ONLY ON WEB
     * Example /courses/28277/modules#module_545
     * @returns {int} id of module or 0 for not found
     */
    function ou_getModuleId() {
        const moduleHash = window.location.hash.substr(1);
        const moduleHashPrefix = 'module_';
        // If the module hash starts with the module_ prefix, remove the prefix to get the Id.
        // Otherwise return 0, moduleId not found
        return moduleHash.startsWith(moduleHashPrefix) ? moduleHash.replace(moduleHashPrefix, '') : 0;
    }

    /**
     * Assigns an icon depending on the type of the item.
     */
    function ou_getItemTypeIcon(itemType) {
      switch (itemType) {
          case 'Page':
              return 'icon-document';
          case 'File':
              return 'icon-paperclip';
          case 'Discussion':
              return 'icon-discussion';
          case 'Quiz':
              return 'icon-quiz';
          case 'Assignment':
              return 'icon-assignment';
          case 'ExternalUrl':
              return 'icon-link';
          default:
              return'icon-document';
      }
    }

    /****************************************/
    /***** End of function definitions ******/
    /****************************************/

})();
