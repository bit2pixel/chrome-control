#!/usr/bin/env osascript -l JavaScript

// MIT License

// Copyright (c) 2025 Renan Cakirerk

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/**
 * A JXA script and an Alfred Workflow for controlling Chrome-based browsers (Javascript for Automation).
 * Also see my "How I Navigate Hundreds of Tabs on Chrome with JXA and Alfred" article at [1]
 * if you're interested in learning how I created the workflow.
 * [1] https://medium.com/@bit2pixel/how-i-navigate-hundreds-of-tabs-on-chrome-with-jxa-and-alfred-9bbf971af02b
 */

ObjC.import('stdlib');
ObjC.import('Foundation');

// Browser configuration
const BROWSERS = {
    'chrome': {
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        supportsJXA: true
    },
    'brave': {
        appName: 'Brave Browser',
        bundleId: 'com.brave.Browser',
        // Brave has limited JXA support, we'll use AppleScript for it
        supportsJXA: false
    },
    'edge': {
        appName: 'Microsoft Edge',
        bundleId: 'com.microsoft.edgemac',
        supportsJXA: true
    },
    'vivaldi': {
        appName: 'Vivaldi',
        bundleId: 'com.vivaldi.Vivaldi',
        supportsJXA: true
    },
    'chromium': {
        appName: 'Chromium',
        bundleId: 'org.chromium.Chromium',
        supportsJXA: true
    }
};

// Default browser and mode settings
let currentBrowser = 'chrome';
let browserApp = null;
let isBraveMode = false;

// Mode flags
const MODE_CLI = 0;    // Ask questions in command line
const MODE_UI = 1;     // Ask questions with browser dialogs
const MODE_YES = 2;    // Answer all questions with `yes`
let MODE = MODE_CLI;   // Default mode is command line
let DEBUG = false;     // Debug mode for verbose logging

// Print the usage message
function usage() {
    println('\n--------------');
    println('Browser Control');
    println('--------------\n');
    println('list                        List all open tabs in all windows                 usage: ./script.js list');
    println('dedup                       Close duplicate tabs                              usage: ./script.js dedup');
    println('close <winIdx,tabIdx>       Close a specific tab in a specific window         usage: ./script.js close 0,13');
    println('close --title <string(s)>   Close all tabs with titles containing strings     usage: ./script.js close --title Inbox "iphone - apple"');
    println('close --url <string(s)>     Close all tabs with URLs containing strings       usage: ./script.js close --url mail.google apple');
    println('focus <winIdx,tabIdx>       Focus on a specific tab in a specific window      usage: ./script.js focus 0,13');
    println('--ui                        If set, use browser to show messages              usage: ./script.js close --title inbox --ui');
    println('--yes                       If set, all questions will be anwered with "y"    usage: ./script.js close --title inbox --yes');
    println('--chrome                    Use Google Chrome (default)                       usage: ./script.js --chrome list');
    println('--brave                     Use Brave Browser                                 usage: ./script.js --brave list');
    println('--edge                      Use Microsoft Edge                                usage: ./script.js --edge list');
    println('--vivaldi                   Use Vivaldi                                       usage: ./script.js --vivaldi list');
    println('--chromium                  Use Chromium                                      usage: ./script.js --chromium list');
    println('--debug                     Enable debug mode for verbose logging             usage: ./script.js --debug list');
    $.exit(1);
}

// Run Browser Control and catch all exceptions
function run(argv) {
    try {
        browserControl(argv);
    } catch (e) {
        println(`Error: ${e}`);
        if (DEBUG) {
            println(`Stack trace (if available): ${e.stack || 'Not available'}`);
            println(`Message: ${e.message || e}`);
        }
        $.exit(1);
    }
}

// Browser Control
function browserControl(argv) {
    if (argv.length < 1) {usage();}

    // Check for debug flag
    const debugFlagIdx = argv.indexOf('--debug');
    if (debugFlagIdx > -1) {
        DEBUG = true;
        argv.splice(debugFlagIdx, 1);
        println("Debug mode enabled");
    }

    // Process browser flags first
    for (const browserKey in BROWSERS) {
        const flagIndex = argv.indexOf(`--${browserKey}`);
        if (flagIndex > -1) {
            currentBrowser = browserKey;
            argv.splice(flagIndex, 1);
            break;
        }
    }

    // Initialize browser application
    if (!initBrowser()) {
        // Show helpful message for permission issues
        const browserInfo = BROWSERS[currentBrowser];
        println(`\n${browserInfo.appName} has all windows closed or there is a permission issue.`);
        println(`\nPossible permission issue: ${browserInfo.appName} may need authorization to be controlled.`);
        println(`Please check these steps:`);
        println(`1. Open "System Settings > Privacy & Security > Automation"`);
        println(`2. Make sure your script/terminal (iterm2?) app has permission to control ${browserInfo.appName}`);
        println(`3. If needed, add your Terminal/script runner to the list and check the box for ${browserInfo.appName}`);
        println(`4. You may need to quit and restart ${browserInfo.appName} after granting permission\n`);
        $.exit(1);
    }

    // Process mode flags
    let uiFlagIdx = argv.indexOf('--ui');
    if (uiFlagIdx > -1) {
        MODE = MODE_UI;
        argv.splice(uiFlagIdx, 1);
    }

    let yesFlagIdx = argv.indexOf('--yes');
    if (yesFlagIdx > -1) {
        MODE = MODE_YES;
        argv.splice(yesFlagIdx, 1);
    }

    // Process commands
    if (argv.length < 1) {usage();}

    const cmd = argv[0];
    if (cmd === 'list') {
        list();
    } else if (cmd === 'dedup') {
        dedup();
    } else if (cmd === 'close') {
        if (argv.length == 1) {usage();}
        if (argv.length == 2) {
            const arg = argv[1];
            closeTab(arg);
            $.exit(0);
        }
        const subcmd = argv[1];
        const keywords = argv.slice(2, argv.length);
        closeByKeyword(subcmd, keywords);
    } else if (cmd === 'focus') {
        if (argv.length !== 2) {usage();}
        const arg = argv[1];
        focus(arg);
    } else {
        usage();
    }

    $.exit(0);
}

// Initialize browser application
function initBrowser() {
    const browserInfo = BROWSERS[currentBrowser];
    isBraveMode = (currentBrowser === 'brave');

    try {
        // Check if browser is running using system events
        let isRunning = false;
        try {
            isRunning = Application('System Events')
                .applicationProcesses
                .whose({bundleIdentifier: browserInfo.bundleId})
                .length > 0;
        } catch (e) {
            // Fallback check using ps command
            const psResult = $.NSTask.alloc.init;
            psResult.setLaunchPath("/bin/ps");
            psResult.setArguments(["aux"]);

            const pipe = $.NSPipe.pipe;
            psResult.setStandardOutput(pipe);
            psResult.launch;

            const data = pipe.fileHandleForReading.readDataToEndOfFile;
            const output = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;

            isRunning = output.includes(browserInfo.appName.replace(/ /g, ''));
        }

        if (!isRunning) {
            println(`Error: ${browserInfo.appName} is not running`);
            return false;
        }

        if (DEBUG) {
            println(`${browserInfo.appName} is running`);
        }

        // Initialize app with appropriate method
        if (isBraveMode) {
            // For Brave, we'll use both AppleScript and JXA approaches as needed
            browserApp = Application(browserInfo.appName);

            // Test AppleScript permission by trying a simple harmless command
            try {
                const permissionTest = `/usr/bin/osascript -e 'tell application "Brave Browser" to get name'`;
                const permTask = $.NSTask.alloc.init;
                permTask.setLaunchPath("/bin/bash");
                permTask.setArguments(["-c", permissionTest]);

                const permPipe = $.NSPipe.pipe;
                permTask.setStandardOutput(permPipe);
                permTask.setStandardError(permPipe); // Capture stderr too
                permTask.launch;
                permTask.waitUntilExit;

                const exitCode = permTask.terminationStatus;
                const permData = permPipe.fileHandleForReading.readDataToEndOfFile;
                const permOutput = $.NSString.alloc.initWithDataEncoding(permData, $.NSUTF8StringEncoding).js;

                if (exitCode !== 0 || permOutput.includes("Not authorized") || permOutput.includes("error")) {
                    if (DEBUG) {
                        println(`Permission issue detected: ${permOutput.trim()}`);
                    }
                    throw new Error("Permission denied: Your script needs authorization to control Brave Browser");
                }

                if (DEBUG) {
                    println("Permission test passed");
                }
            } catch (permError) {
                if (DEBUG) {
                    println(`Permission test failed: ${permError}`);
                }
                throw new Error("Permission denied: Your script needs authorization to control Brave Browser");
            }

            // Get window count using osascript directly
            let windowCount = 0;
            try {
                const cmd = `/usr/bin/osascript -e 'tell application "${browserInfo.appName}" to count windows'`;
                const task = $.NSTask.alloc.init;
                task.setLaunchPath("/bin/bash");
                task.setArguments(["-c", cmd]);

                const pipe = $.NSPipe.pipe;
                task.setStandardOutput(pipe);
                task.launch;
                task.waitUntilExit;

                const data = pipe.fileHandleForReading.readDataToEndOfFile;
                windowCount = parseInt($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js.trim()) || 0;

                if (DEBUG) {
                    println(`Brave Browser window count: ${windowCount}`);
                }
            } catch (e) {
                if (DEBUG) {
                    println(`Error getting window count: ${e}`);
                }
                throw e;
            }

            return windowCount > 0;
        } else {
            // For other browsers, use standard JXA
            browserApp = Application(browserInfo.appName);
            browserApp.includeStandardAdditions = true;

            // Test permission by accessing window count
            try {
                const windowCount = browserApp.windows.length;
                if (DEBUG) {
                    println(`Successfully connected to ${browserInfo.appName}`);
                    println(`Number of windows: ${windowCount}`);
                }
                return true;
            } catch (e) {
                if (e.message && (
                    e.message.includes("not allowed") ||
                    e.message.includes("Not authorized") ||
                    e.message.includes("permission")
                )) {
                    throw new Error(`Permission denied: Your script needs authorization to control ${browserInfo.appName}`);
                }
                throw e;
            }
        }
    } catch (e) {
        println(`Error: Could not connect to ${browserInfo.appName}. Details: ${e}`);
        if (DEBUG) {
            println(`Error details: ${e.message || e}`);
        }
        return false;
    }
}

/**
 * Commands
 */

// List all open tabs
function list() {
    // Collect all tabs
    const tabs = getAllTabs();

    if (tabs.length === 0) {
        println(`No tabs found or could not access tabs in ${BROWSERS[currentBrowser].appName}`);
        $.exit(0);
    }

    if (DEBUG) {
        println(`Found ${tabs.length} tabs`);
    }

    // Create URL to title map
    let urlToTitle = {};
    tabs.forEach(tabInfo => {
        urlToTitle[tabInfo.url] = {
            'title': tabInfo.title || 'No Title',
            'url': tabInfo.url,
            'winIdx': tabInfo.winIdx,
            'tabIdx': tabInfo.tabIdx,
            'browser': currentBrowser,

            // Alfred specific properties
            'arg': `${tabInfo.winIdx},${tabInfo.tabIdx}`,
            'subtitle': tabInfo.url,
        };
    });

    // Create a title to url map
    let titleToUrl = {};
    Object.keys(urlToTitle).forEach(url => {
        titleToUrl[urlToTitle[url].title] = urlToTitle[url];
    });

    // Generate output
    out = {'items': []};
    Object.keys(titleToUrl).sort().forEach(title => {
        out.items.push(titleToUrl[title]);
    });

    // Print output
    println(JSON.stringify(out));
}

// Close a specific tab
function closeTab(arg) {
    let {winIdx, tabIdx} = parseWinTabIdx(arg);

    // For Brave, use AppleScript
    if (isBraveMode) {
        // Validate indices via AppleScript
        const windowCount = parseInt(runAppleScript(`
            tell application "Brave Browser"
                count of windows
            end tell
        `));

        if (winIdx >= windowCount) {
            println(`Error: Window index ${winIdx} out of range (max: ${windowCount - 1})`);
            $.exit(1);
        }

        const tabCount = parseInt(runAppleScript(`
            tell application "Brave Browser"
                count of tabs of window ${winIdx + 1}
            end tell
        `));

        if (tabIdx >= tabCount) {
            println(`Error: Tab index ${tabIdx} out of range (max: ${tabCount - 1})`);
            $.exit(1);
        }

        // Get tab title for confirmation
        const tabTitle = runAppleScript(`
            tell application "Brave Browser"
                get title of tab ${tabIdx + 1} of window ${winIdx + 1}
            end tell
        `);

        // Ask the user before closing tab
        areYouSure([{title: tabTitle}], 'Close this tab?', 'Couldn\'t find any matching tabs');

        // Close the tab using AppleScript
        runAppleScript(`
            tell application "Brave Browser"
                close tab ${tabIdx + 1} of window ${winIdx + 1}
            end tell
        `);

        println(`Closed tab ${winIdx},${tabIdx}`);
        return;
    }

    // For other browsers, use JXA
    try {
        // Validate window and tab indices
        if (winIdx >= browserApp.windows.length) {
            println(`Error: Window index ${winIdx} out of range (max: ${browserApp.windows.length - 1})`);
            $.exit(1);
        }

        if (tabIdx >= browserApp.windows[winIdx].tabs.length) {
            println(`Error: Tab index ${tabIdx} out of range (max: ${browserApp.windows[winIdx].tabs.length - 1})`);
            $.exit(1);
        }

        let tabToClose = browserApp.windows[winIdx].tabs[tabIdx];

        // Ask the user before closing tab
        areYouSure([tabToClose], 'Close this tab?', 'Couldn\'t find any matching tabs');

        tabToClose.close();
        println(`Closed tab ${winIdx},${tabIdx}`);
    } catch (e) {
        println(`Error: Failed to close tab ${winIdx},${tabIdx}. Details: ${e}`);
        $.exit(1);
    }
}

// Close a tab if strings are found in the title or URL
function closeByKeyword(cmd, keywords) {
    let propertyName = '';
    if (cmd === '--title') {
        propertyName = 'title';
    } else if (cmd === '--url') {
        propertyName = 'url';
    } else {
        usage();
    }

    // Collect all tabs first
    const allTabs = getAllTabs();

    if (allTabs.length === 0) {
        println(`No tabs found or could not access tabs in ${BROWSERS[currentBrowser].appName}`);
        $.exit(0);
    }

    // Find tabs that match the keywords
    let tabsToClose = [];
    keywords.forEach(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        allTabs.forEach(tabInfo => {
            const property = (tabInfo[propertyName] || '').toLowerCase();
            if (property.includes(lowerKeyword)) {
                // Add if not already in the list
                if (!tabsToClose.some(t => t.winIdx === tabInfo.winIdx && t.tabIdx === tabInfo.tabIdx)) {
                    tabsToClose.push(tabInfo);
                }
            }
        });
    });

    if (tabsToClose.length === 0) {
        println('Couldn\'t find any matching tabs');
        $.exit(0);
    }

    // Ask the user before closing tabs
    areYouSure(tabsToClose, 'Close these tabs?', 'Couldn\'t find any matching tabs');

    // Close tabs from last to first to avoid index shifting problems
    let closedCount = 0;

    if (isBraveMode) {
        // For Brave, use AppleScript to close tabs
        tabsToClose.sort((a, b) => {
            // Sort by window index (descending)
            if (a.winIdx !== b.winIdx) return b.winIdx - a.winIdx;
            // Then by tab index (descending)
            return b.tabIdx - a.tabIdx;
        }).forEach(tab => {
            try {
                runAppleScript(`
                    tell application "Brave Browser"
                        close tab ${tab.tabIdx + 1} of window ${tab.winIdx + 1}
                    end tell
                `);
                closedCount++;
            } catch (e) {
                if (DEBUG) println(`Error closing tab: ${e}`);
            }
        });
    } else {
        // For other browsers, use JXA
        tabsToClose.sort((a, b) => {
            if (a.winIdx !== b.winIdx) return b.winIdx - a.winIdx;
            return b.tabIdx - a.tabIdx;
        }).forEach(tab => {
            try {
                browserApp.windows[tab.winIdx].tabs[tab.tabIdx].close();
                closedCount++;
            } catch (e) {
                if (DEBUG) println(`Error closing tab: ${e}`);
            }
        });
    }

    println(`Closed ${closedCount} tab${closedCount !== 1 ? 's' : ''}`);
}

// Focus on a specific tab
function focus(arg) {
    let {winIdx, tabIdx} = parseWinTabIdx(arg);

    if (isBraveMode) {
        // Validate indices via AppleScript
        const windowCount = parseInt(runAppleScript(`
            tell application "Brave Browser"
                count of windows
            end tell
        `));

        if (winIdx >= windowCount) {
            println(`Error: Window index ${winIdx} out of range (max: ${windowCount - 1})`);
            $.exit(1);
        }

        const tabCount = parseInt(runAppleScript(`
            tell application "Brave Browser"
                count of tabs of window ${winIdx + 1}
            end tell
        `));

        if (tabIdx >= tabCount) {
            println(`Error: Tab index ${tabIdx} out of range (max: ${tabCount - 1})`);
            $.exit(1);
        }

        // Focus on the tab using AppleScript
        runAppleScript(`
            tell application "Brave Browser"
                activate
                set index of window ${winIdx + 1} to 1
                set active tab index of window ${winIdx + 1} to ${tabIdx + 1}
            end tell
        `);

        println(`Focused on tab ${winIdx},${tabIdx}`);
        return;
    }

    // For other browsers, use JXA
    try {
        // Validate window and tab indices
        if (winIdx >= browserApp.windows.length) {
            println(`Error: Window index ${winIdx} out of range (max: ${browserApp.windows.length - 1})`);
            $.exit(1);
        }

        if (tabIdx >= browserApp.windows[winIdx].tabs.length) {
            println(`Error: Tab index ${tabIdx} out of range (max: ${browserApp.windows[winIdx].tabs.length - 1})`);
            $.exit(1);
        }

        browserApp.windows[winIdx].visible = true;
        browserApp.windows[winIdx].activeTabIndex = tabIdx + 1; // Focus on tab
        browserApp.windows[winIdx].index = 1; // Focus on this specific browser window
        browserApp.activate();

        println(`Focused on tab ${winIdx},${tabIdx}`);
    } catch (e) {
        println(`Error: Failed to focus on tab ${winIdx},${tabIdx}. Details: ${e}`);
        $.exit(1);
    }
}

// Close duplicate tabs
function dedup() {
    // Collect all tabs first
    const allTabs = getAllTabs();

    if (allTabs.length === 0) {
        println(`No tabs found or could not access tabs in ${BROWSERS[currentBrowser].appName}`);
        $.exit(0);
    }

    // Find duplicate tabs
    let seen = {};
    let duplicates = [];

    allTabs.forEach(tabInfo => {
        const url = tabInfo.url;
        if (url && seen[url]) {
            duplicates.push(tabInfo);
        } else if (url) {
            seen[url] = true;
        }
    });

    if (duplicates.length === 0) {
        println('No duplicate tabs found');
        $.exit(0);
    }

    // Ask the user before closing tabs
    areYouSure(duplicates, 'Close these duplicates?', 'No duplicates found');

    // Close tabs from last to first to avoid index shifting
    let closedCount = 0;

    if (isBraveMode) {
        // For Brave, use AppleScript to close tabs
        duplicates.sort((a, b) => {
            // Sort by window index (descending)
            if (a.winIdx !== b.winIdx) return b.winIdx - a.winIdx;
            // Then by tab index (descending)
            return b.tabIdx - a.tabIdx;
        }).forEach(tab => {
            try {
                runAppleScript(`
                    tell application "Brave Browser"
                        close tab ${tab.tabIdx + 1} of window ${tab.winIdx + 1}
                    end tell
                `);
                closedCount++;
            } catch (e) {
                if (DEBUG) println(`Error closing tab: ${e}`);
            }
        });
    } else {
        // For other browsers, use JXA
        duplicates.sort((a, b) => {
            if (a.winIdx !== b.winIdx) return b.winIdx - a.winIdx;
            return b.tabIdx - a.tabIdx;
        }).forEach(tab => {
            try {
                browserApp.windows[tab.winIdx].tabs[tab.tabIdx].close();
                closedCount++;
            } catch (e) {
                if (DEBUG) println(`Error closing tab: ${e}`);
            }
        });
    }

    println(`Closed ${closedCount} duplicate tab${closedCount !== 1 ? 's' : ''}`);
}

/**
 * Helpers
 */

// Collect all tabs with their window and tab indices
function getAllTabs() {
    let tabs = [];

    if (isBraveMode) {
        try {
            // Use a direct osascript call to get all tab information at once
            // This is more reliable than using runAppleScript for Brave
            const script = `
            osascript <<EOF
            set tabData to ""
            tell application "Brave Browser"
                set windowCount to count of windows
                repeat with winIdx from 1 to windowCount
                    set tabCount to count of tabs of window winIdx
                    repeat with tabIdx from 1 to tabCount
                        set tabTitle to title of tab tabIdx of window winIdx
                        set tabUrl to URL of tab tabIdx of window winIdx
                        set tabData to tabData & (winIdx - 1) & "," & (tabIdx - 1) & "," & tabTitle & "," & tabUrl & "\\n"
                    end repeat
                end repeat
            end tell
            return tabData
            EOF
            `;

            // Execute the script using bash
            const task = $.NSTask.alloc.init;
            task.setLaunchPath("/bin/bash");
            task.setArguments(["-c", script]);

            const pipe = $.NSPipe.pipe;
            task.setStandardOutput(pipe);
            task.launch;
            task.waitUntilExit;

            const data = pipe.fileHandleForReading.readDataToEndOfFile;
            const output = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;

            if (DEBUG) {
                println(`Got ${output.split('\n').length} tabs from Brave`);
            }

            // Parse the results
            output.trim().split('\n').forEach(line => {
                if (!line.trim()) return;

                try {
                    // Find the first and second comma for winIdx and tabIdx
                    const firstCommaIndex = line.indexOf(',');
                    const secondCommaIndex = line.indexOf(',', firstCommaIndex + 1);

                    if (firstCommaIndex === -1 || secondCommaIndex === -1) {
                        if (DEBUG) println(`Invalid line format: ${line}`);
                        return;
                    }

                    const winIdx = parseInt(line.substring(0, firstCommaIndex));
                    const tabIdx = parseInt(line.substring(firstCommaIndex + 1, secondCommaIndex));

                    // The rest of the line contains the title and URL, which may contain commas
                    // Find the last occurrence of a URL-like pattern (starting with http or https)
                    const restOfLine = line.substring(secondCommaIndex + 1);
                    let urlStartIndex = Math.max(
                        restOfLine.lastIndexOf('http://'),
                        restOfLine.lastIndexOf('https://')
                    );

                    if (urlStartIndex === -1) {
                        // Try other common URL prefixes if http/https not found
                        urlStartIndex = Math.max(
                            restOfLine.lastIndexOf('file://'),
                            restOfLine.lastIndexOf('chrome://'),
                            restOfLine.lastIndexOf('brave://'),
                            restOfLine.lastIndexOf('about:')
                        );
                    }

                    let title, url;
                    if (urlStartIndex === -1) {
                        // Can't find a URL pattern, use everything after the second comma as title
                        title = restOfLine;
                        url = '';
                    } else {
                        title = restOfLine.substring(0, urlStartIndex).trim();
                        url = restOfLine.substring(urlStartIndex).trim();
                    }

                    tabs.push({
                        title: title,
                        url: url,
                        winIdx: winIdx,
                        tabIdx: tabIdx
                    });
                } catch (e) {
                    if (DEBUG) {
                        println(`Error parsing tab info from line "${line}": ${e}`);
                    }
                }
            });

        } catch (e) {
            println(`Error accessing Brave Browser windows: ${e}`);

            // Fallback to basic window and tab counting
            try {
                // Get window count
                const cmd1 = `/usr/bin/osascript -e 'tell application "Brave Browser" to count windows'`;
                const task1 = $.NSTask.alloc.init;
                task1.setLaunchPath("/bin/bash");
                task1.setArguments(["-c", cmd1]);

                const pipe1 = $.NSPipe.pipe;
                task1.setStandardOutput(pipe1);
                task1.launch;
                task1.waitUntilExit;

                const data1 = pipe1.fileHandleForReading.readDataToEndOfFile;
                const windowCount = parseInt($.NSString.alloc.initWithDataEncoding(data1, $.NSUTF8StringEncoding).js.trim()) || 0;

                if (DEBUG) {
                    println(`Brave has ${windowCount} windows (fallback method)`);
                }

                // For each window, get the tab count and basic info
                for (let winIdx = 0; winIdx < windowCount; winIdx++) {
                    const cmd2 = `/usr/bin/osascript -e 'tell application "Brave Browser" to count tabs of window ${winIdx + 1}'`;
                    const task2 = $.NSTask.alloc.init;
                    task2.setLaunchPath("/bin/bash");
                    task2.setArguments(["-c", cmd2]);

                    const pipe2 = $.NSPipe.pipe;
                    task2.setStandardOutput(pipe2);
                    task2.launch;
                    task2.waitUntilExit;

                    const data2 = pipe2.fileHandleForReading.readDataToEndOfFile;
                    const tabCount = parseInt($.NSString.alloc.initWithDataEncoding(data2, $.NSUTF8StringEncoding).js.trim()) || 0;

                    for (let tabIdx = 0; tabIdx < tabCount; tabIdx++) {
                        // We can't get the title/URL in this fallback mode, but at least we know tab indices
                        tabs.push({
                            title: `Tab ${tabIdx} (Window ${winIdx})`,
                            url: '',
                            winIdx: winIdx,
                            tabIdx: tabIdx
                        });
                    }
                }
            } catch (fallbackErr) {
                if (DEBUG) {
                    println(`Fallback method also failed: ${fallbackErr}`);
                }
            }
        }
    } else {
        // Standard approach for Chrome and other browsers
        try {
            browserApp.windows().forEach((window, winIdx) => {
                try {
                    window.tabs().forEach((tab, tabIdx) => {
                        try {
                            tabs.push({
                                title: tab.title() || 'Untitled',
                                url: tab.url() || '',
                                winIdx: winIdx,
                                tabIdx: tabIdx,
                                // Save reference to the tab for JXA operations
                                tab: tab
                            });
                        } catch (e) {
                            if (DEBUG) {
                                println(`Error getting tab info for tab ${tabIdx} in window ${winIdx}: ${e}`);
                            }
                        }
                    });
                } catch (e) {
                    if (DEBUG) {
                        println(`Error accessing tabs in window ${winIdx}: ${e}`);
                    }
                }
            });
        } catch (e) {
            println(`Error accessing browser windows: ${e}`);
        }
    }

    return tabs;
}

// Run AppleScript and return the result
function runAppleScript(script) {
    try {
        // Create error object to capture errors
        const errorDict = $.NSMutableDictionary.alloc.init;

        // Execute the script and capture any errors
        const result = $.NSAppleScript.alloc.initWithSource(script).executeAndReturnError(errorDict);

        // Check for errors
        if (errorDict.count > 0) {
            const errorInfo = ObjC.deepUnwrap(errorDict);
            if (DEBUG) {
                println(`AppleScript execution error: ${JSON.stringify(errorInfo)}`);
            }
            throw new Error(`AppleScript error code: ${errorInfo.NSAppleScriptErrorNumber}`);
        }

        // Handle the result
        if (result) {
            // Convert the result to JavaScript string safely
            const stringValue = result.stringValue;
            if (stringValue) {
                return ObjC.unwrap(stringValue);
            }
            return "";
        }
        return "";
    } catch (e) {
        if (DEBUG) {
            println(`AppleScript error: ${e}`);
        }
        throw e;
    }
}

// Show a message box in browser
function alert(msg) {
    if (MODE === MODE_YES) {
        return;
    }

    if (isBraveMode) {
        try {
            runAppleScript(`
                tell application "Brave Browser"
                    activate
                    display alert "${msg.replace(/"/g, '\\"')}"
                end tell
            `);
        } catch (e) {
            // Fall back to command line
            println(`\n${msg}`);
        }
    } else {
        try {
            browserApp.activate();
            browserApp.displayAlert(msg);
        } catch (e) {
            // Fall back to command line
            println(`\n${msg}`);
        }
    }
}

// Grab input from the command line and return it
function prompt(msg) {
    if (MODE === MODE_YES) {
        return 'y';
    } else if (MODE === MODE_UI) {
        if (isBraveMode) {
            try {
                const result = runAppleScript(`
                    tell application "Brave Browser"
                        activate
                        display dialog "${msg.replace(/"/g, '\\"')}" buttons {"Cancel", "OK"} default button "Cancel"
                        set theButton to button returned of result
                        return theButton
                    end tell
                `);
                return (result === "OK") ? 'y' : 'n';
            } catch (e) {
                // Fall back to command line
                MODE = MODE_CLI;
            }
        } else {
            try {
                browserApp.activate();
                const response = browserApp.displayDialog(msg, {
                    buttons: ['Cancel', 'OK'],
                    defaultButton: 'Cancel'
                });
                return (response.buttonReturned === 'OK') ? 'y' : 'n';
            } catch (e) {
                // Fall back to command line
                MODE = MODE_CLI;
            }
        }
    }

    if (MODE === MODE_CLI) {
        println(`\n${msg} (y/N)`);
        try {
            return $.NSString.alloc.initWithDataEncoding(
                $.NSFileHandle.fileHandleWithStandardInput.availableData,
                $.NSUTF8StringEncoding
            ).js.trim();
        } catch (e) {
            println(`Error reading input: ${e}`);
            return 'n';
        }
    }
}

// JXA always prints to stderr, so we need this custom print function
function print(msg) {
    try {
        $.NSFileHandle.fileHandleWithStandardOutput.writeData(
            $.NSString.alloc.initWithString(String(msg))
                .dataUsingEncoding($.NSUTF8StringEncoding)
        );
    } catch (e) {
        // Last resort fallback
        console.log(msg);
    }
}

// Print with a new line at the end
function println(msg) {
    print(msg + '\n');
}

// Ask the user before closing tabs
function areYouSure(tabsToClose, promptMsg, emptyMsg) {
    // Give user feedback if no matching tabs were found
    if (tabsToClose.length === 0) {
        if (MODE == MODE_CLI) {
            println(emptyMsg);
        } else {
            alert(emptyMsg);
        }
        $.exit(0);
    }

    // Grab the titles to show to the user
    let titles = [];

    tabsToClose.forEach(tab => {
        try {
            // Handle both direct tab objects and our custom tab info objects
            if (tab.title && typeof tab.title === 'string') {
                titles.push(tab.title || 'Untitled Tab');
            } else if (tab.title && typeof tab.title === 'function') {
                titles.push(tab.title() || 'Untitled Tab');
            } else if (tab.url) {
                titles.push(tab.url);
            } else {
                titles.push('Untitled Tab');
            }
        } catch (e) {
            titles.push('Untitled Tab');
        }
    });

    // Show a limited number of tabs if there are many
    const maxTitlesToShow = 15;
    let displayMsg = promptMsg;

    if (titles.length > maxTitlesToShow) {
        const displayTitles = titles.slice(0, maxTitlesToShow);
        const remaining = titles.length - maxTitlesToShow;

        displayMsg = `${promptMsg} (${titles.length} tabs total, showing first ${maxTitlesToShow})`;
        if (MODE == MODE_CLI) {
            println(`\n${displayTitles.join('\n\n')}`);
            println(`\n...and ${remaining} more tab(s)`);
        } else {
            displayMsg = `${displayMsg}\n\n${displayTitles.join('\n\n')}\n\n...and ${remaining} more tab(s)`;
        }
    } else {
        if (MODE == MODE_CLI) {
            println(`\n${titles.join('\n\n')}`);
        } else {
            displayMsg = `${displayMsg}\n\n${titles.join('\n\n')}`;
        }
    }

    // Ask for confirmation
    if (MODE == MODE_CLI || MODE == MODE_UI) {
        if (prompt(displayMsg) !== 'y') {
            println('Canceled');
            $.exit(0);
        }
    }
    // MODE_YES continues automatically
}

// Get winIdx and tabIdx from arg
function parseWinTabIdx(arg) {
    const s = arg.split(',');
    if (s.length !== 2) {
        println('\nInvalid window and tab index. Example: 0,13\n');
        usage();
    }

    let winIdx = parseInt(s[0]);
    let tabIdx = parseInt(s[1]);

    if (isNaN(winIdx) || isNaN(tabIdx)) {
        throw new Error("Window and tab indices must be integers");
    }

    return {winIdx, tabIdx};
}
