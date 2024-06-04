// ==UserScript==
// @name         Printable ALDI recipes
// @namespace    http://tampermonkey.net/
// @version      2024-06-04
// @description  Printable recipe layout. Alters the layout for single page printing. Take a screenshot then print that. Good enough for now.
// @author       Steve Swinsburg
// @match        https://www.aldi.com.au/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=aldi.com.au
// @grant        none
// ==/UserScript==


(function() {
    'use strict';

    // Function to hide elements
    function hideElements() {
        const topMenu = document.querySelector('.header');
        const mainNavBar = document.querySelector('#main-nav-bar');
        const mainNav = document.querySelector('#main-nav');
        const breadcrumbNav = document.querySelector('#breadcrumb-nav');
        const tabNav = document.querySelector('#tab-navigation');
        const subNav = document.querySelector('#sub-nav');
        const toTop = document.querySelector('#to-top-button');
        const footer = document.querySelector('.footer');

        if (topMenu) topMenu.style.display = 'none';
        if (mainNavBar) mainNavBar.style.display = 'none';
        if (mainNav) mainNav.style.display = 'none';
        if (breadcrumbNav) breadcrumbNav.style.display = 'none';
        if (tabNav) tabNav.style.display = 'none';
        if (subNav) subNav.style.display = 'none';
        if (toTop) toTop.style.display = 'none';
        if (footer) footer.style.display = 'none';
    }

    // Function to create and style the button
    function createPrintButton() {
        const printButton = document.createElement('button');
        printButton.innerText = 'Print';
        printButton.style.marginLeft = '4px';
        printButton.style.padding = '5px 10px';
        printButton.style.backgroundColor = '#28a745';
        printButton.style.color = '#fff';
        printButton.style.border = 'none';
        printButton.style.borderRadius = '5px';
        printButton.style.cursor = 'pointer';
        //printButton.style.fontSize = '16px';

        // Add click event to the button
        printButton.addEventListener('click', () => {
            hideElements();

            //hide self
            printButton.style.display = 'none';

        });

        // Find the h1 element within #main-content and append the button
        const mainContentHeader = document.querySelector('#main-content h1');
        if (mainContentHeader) {
            mainContentHeader.appendChild(printButton);
        }

    }

    // Wait for the DOM content to be fully loaded before adding the button
    window.addEventListener('load', createPrintButton);
})();
