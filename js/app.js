// AGE-PRO Data Archive - Main Application
// Depends on AGEPRO_DATA from data.js

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const FILTER_KEYS = ["region", "disk", "band", "molecule", "dataType"];

  const state = {
    filters: {
      region: new Set(),
      disk: new Set(),
      band: new Set(),
      molecule: new Set(),
      dataType: new Set(),
    },
    availableOptions: {
      region: new Set(),
      disk: new Set(),
      band: new Set(),
      molecule: new Set(),
      dataType: new Set(),
    },
    filteredData: [],
    selectedIds: new Set(),
    sortKey: null,     // current sort column key (e.g. "filename", "sizeMB")
    sortAsc: true,     // true = ascending, false = descending
  };

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------
  function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }

  function formatSize(mb) {
    if (mb >= 1000) return (mb / 1000).toFixed(1) + " GB";
    if (mb === 0) return "<1 MB";
    return mb.toFixed(1) + " MB";
  }

  function formatTotalSize(mb) {
    if (mb >= 1000) return (mb / 1000).toFixed(1) + " GB";
    return mb.toFixed(1) + " MB";
  }

  function padTwo(n) {
    return String(n).padStart(2, "0");
  }

  function formatTimestamp(date) {
    return (
      date.getFullYear() +
      padTwo(date.getMonth() + 1) +
      padTwo(date.getDate()) +
      "_" +
      padTwo(date.getHours()) +
      padTwo(date.getMinutes()) +
      padTwo(date.getSeconds())
    );
  }

  function regionBadgeClass(region) {
    var r = region.toLowerCase().replace(/\s+/g, "-");
    if (r === "lupus") return "badge-lupus";
    if (r === "upper-sco") return "badge-upper-sco";
    if (r === "ophiuchus") return "badge-ophiuchus";
    return "badge-default";
  }

  // ---------------------------------------------------------------------------
  // Filter Logic
  // ---------------------------------------------------------------------------
  function computeAvailableOptions() {
    for (const key of FILTER_KEYS) {
      var otherKeys = FILTER_KEYS.filter(function (k) { return k !== key; });
      var matching = AGEPRO_DATA.filter(function (record) {
        return otherKeys.every(function (otherKey) {
          var selected = state.filters[otherKey];
          if (selected.size === 0) return true;
          return selected.has(record[otherKey]);
        });
      });
      state.availableOptions[key] = new Set(matching.map(function (r) { return r[key]; }));
    }
  }

  function applyFilters() {
    computeAvailableOptions();

    state.filteredData = AGEPRO_DATA.filter(function (record) {
      return FILTER_KEYS.every(function (key) {
        var selected = state.filters[key];
        if (selected.size === 0) return true;
        return selected.has(record[key]);
      });
    });

    applySorting();
    updateFilterUI();
    renderTable();
    updateSummary();
    updateGenerateButton();
    updateWorkflowSteps();
  }

  // ---------------------------------------------------------------------------
  // Filter UI
  // ---------------------------------------------------------------------------
  function buildFilterUI() {
    var allValues = {};
    FILTER_KEYS.forEach(function (key) {
      var vals = [];
      var seen = new Set();
      AGEPRO_DATA.forEach(function (r) {
        if (!seen.has(r[key])) {
          seen.add(r[key]);
          vals.push(r[key]);
        }
      });
      vals.sort(naturalSort);
      allValues[key] = vals;
    });

    FILTER_KEYS.forEach(function (key) {
      var container = document.querySelector("#filter-" + key + " .filter-options");
      allValues[key].forEach(function (value) {
        var label = document.createElement("label");
        label.className = "filter-option";

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = value;
        cb.dataset.filterKey = key;
        cb.addEventListener("change", onFilterChange);

        var text = document.createTextNode(" " + value);
        var badge = document.createElement("span");
        badge.className = "count-badge";

        label.appendChild(cb);
        label.appendChild(text);
        label.appendChild(badge);
        container.appendChild(label);
      });
    });

    // Wire up All/None buttons
    document.querySelectorAll(".filter-group").forEach(function (group) {
      var key = group.id.replace("filter-", "");
      group.querySelectorAll(".btn-sm").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var action = btn.dataset.action;
          var checkboxes = group.querySelectorAll('.filter-options input[type="checkbox"]');
          if (action === "select-all") {
            checkboxes.forEach(function (cb) {
              cb.checked = true;
              state.filters[key].add(cb.value);
            });
          } else {
            checkboxes.forEach(function (cb) {
              cb.checked = false;
            });
            state.filters[key].clear();
          }
          applyFilters();
        });
      });
    });
  }

  function onFilterChange(e) {
    var key = e.target.dataset.filterKey;
    var value = e.target.value;
    if (e.target.checked) {
      state.filters[key].add(value);
    } else {
      state.filters[key].delete(value);
    }
    applyFilters();
  }

  function updateFilterUI() {
    FILTER_KEYS.forEach(function (key) {
      var options = document.querySelectorAll("#filter-" + key + " .filter-option");
      options.forEach(function (label) {
        var cb = label.querySelector("input");
        var available = state.availableOptions[key].has(cb.value);
        label.classList.toggle("unavailable", !available);

        // Update count badge: count of filtered data matching this value
        var badge = label.querySelector(".count-badge");
        if (available) {
          var count = state.filteredData.filter(function (r) {
            return r[key] === cb.value;
          }).length;
          // Only show count if this filter has active selections
          if (state.filters[key].size > 0 && state.filters[key].has(cb.value)) {
            badge.textContent = count;
          } else {
            badge.textContent = "";
          }
        } else {
          badge.textContent = "";
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Table Rendering
  // ---------------------------------------------------------------------------
  function renderTable() {
    var tbody = document.getElementById("results-body");
    var emptyState = document.getElementById("empty-state");
    var tableWrapper = document.querySelector(".results-table-wrapper");

    if (state.filteredData.length === 0) {
      tableWrapper.style.display = "none";
      emptyState.classList.add("show");
      tbody.innerHTML = "";
      updateHeaderCheckbox();
      return;
    }

    tableWrapper.style.display = "";
    emptyState.classList.remove("show");

    var fragment = document.createDocumentFragment();

    state.filteredData.forEach(function (record) {
      var tr = document.createElement("tr");
      var isSelected = state.selectedIds.has(record.id);
      if (isSelected) tr.className = "selected";

      tr.innerHTML =
        '<td class="col-check"><input type="checkbox" class="row-checkbox" data-id="' +
        record.id +
        '"' +
        (isSelected ? " checked" : "") +
        "></td>" +
        '<td class="filename" title="' +
        escapeAttr(record.filename) +
        '">' +
        escapeHtml(record.filename) +
        "</td>" +
        '<td><span class="badge-region ' + regionBadgeClass(record.region) + '">' +
        escapeHtml(record.region) +
        "</span></td>" +
        "<td>" + escapeHtml(record.disk) + "</td>" +
        "<td>" + escapeHtml(record.band) + "</td>" +
        "<td>" + escapeHtml(record.molecule) + "</td>" +
        "<td>" + escapeHtml(record.dataType) + "</td>" +
        '<td class="size">' + formatSize(record.sizeMB) + "</td>";

      fragment.appendChild(tr);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    updateHeaderCheckbox();
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function updateHeaderCheckbox() {
    var cb = document.getElementById("select-all-checkbox");
    var shownIds = state.filteredData.map(function (r) { return r.id; });
    if (shownIds.length === 0) {
      cb.checked = false;
      cb.indeterminate = false;
      return;
    }
    var allSelected = shownIds.every(function (id) { return state.selectedIds.has(id); });
    var someSelected = shownIds.some(function (id) { return state.selectedIds.has(id); });
    cb.checked = allSelected;
    cb.indeterminate = !allSelected && someSelected;
  }

  // ---------------------------------------------------------------------------
  // Selection Management
  // ---------------------------------------------------------------------------
  function onRowCheckboxChange(e) {
    var id = parseInt(e.target.dataset.id, 10);
    if (e.target.checked) {
      state.selectedIds.add(id);
      e.target.closest("tr").classList.add("selected");
    } else {
      state.selectedIds.delete(id);
      e.target.closest("tr").classList.remove("selected");
    }
    updateSummary();
    updateGenerateButton();
    updateHeaderCheckbox();
    updateWorkflowSteps();
  }

  function selectAllShown() {
    state.filteredData.forEach(function (r) { state.selectedIds.add(r.id); });
    renderTable();
    updateSummary();
    updateGenerateButton();
    updateWorkflowSteps();
  }

  function deselectAll() {
    state.selectedIds.clear();
    renderTable();
    updateSummary();
    updateGenerateButton();
    updateWorkflowSteps();
  }

  function updateSummary() {
    var totalFiltered = state.filteredData.length;
    var totalFilteredSize = state.filteredData.reduce(function (sum, r) { return sum + r.sizeMB; }, 0);

    var selectedSize = 0;
    state.selectedIds.forEach(function (id) {
      selectedSize += AGEPRO_DATA[id].sizeMB;
    });

    document.getElementById("results-count").textContent =
      "Showing " + totalFiltered + " of " + AGEPRO_DATA.length + " files";
    document.getElementById("results-size").textContent =
      "Total: " + formatTotalSize(totalFilteredSize);
    document.getElementById("selected-count").textContent =
      state.selectedIds.size + " selected";
    document.getElementById("selected-size").textContent =
      "Selected: " + formatTotalSize(selectedSize);
  }

  function updateGenerateButton() {
    document.getElementById("btn-generate").disabled = state.selectedIds.size === 0;
  }

  // ---------------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------------
  function applySorting() {
    if (!state.sortKey) return;
    var key = state.sortKey;
    var asc = state.sortAsc;
    state.filteredData.sort(function (a, b) {
      var va = a[key];
      var vb = b[key];
      if (typeof va === "number") {
        return asc ? va - vb : vb - va;
      }
      var cmp = naturalSort(va, vb);
      return asc ? cmp : -cmp;
    });
  }

  function onSortClick(e) {
    var th = e.target.closest("th.sortable");
    if (!th) return;
    var key = th.dataset.sort;
    if (state.sortKey === key) {
      state.sortAsc = !state.sortAsc;
    } else {
      state.sortKey = key;
      state.sortAsc = true;
    }
    updateSortUI();
    applySorting();
    renderTable();
  }

  function updateSortUI() {
    document.querySelectorAll("#results-table th.sortable").forEach(function (th) {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.sort === state.sortKey) {
        th.classList.add(state.sortAsc ? "sort-asc" : "sort-desc");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Workflow Step Indicators
  // ---------------------------------------------------------------------------
  function updateWorkflowSteps() {
    var hasFilters = FILTER_KEYS.some(function (key) {
      return state.filters[key].size > 0;
    });
    var hasSelection = state.selectedIds.size > 0;

    var steps = document.querySelectorAll(".workflow-steps .step");
    // Step 1: Filter Data
    steps[0].classList.toggle("completed", hasFilters);
    steps[0].classList.toggle("active", !hasFilters);
    // Step 2: Select Files
    steps[1].classList.toggle("completed", hasSelection);
    steps[1].classList.toggle("active", hasFilters && !hasSelection);
    // Step 3: Download
    steps[2].classList.toggle("active", hasSelection);
  }

  // ---------------------------------------------------------------------------
  // Reset All Filters
  // ---------------------------------------------------------------------------
  function resetAllFilters() {
    FILTER_KEYS.forEach(function (key) {
      state.filters[key].clear();
    });
    document.querySelectorAll('.filter-options input[type="checkbox"]').forEach(function (cb) {
      cb.checked = false;
    });
    state.sortKey = null;
    state.sortAsc = true;
    updateSortUI();
    applyFilters();
  }

  // ---------------------------------------------------------------------------
  // Script Generation
  // ---------------------------------------------------------------------------
  // Template constants generated via JSON encoding from the original download
  // script. This guarantees perfect bash syntax fidelity (no manual escaping).
  // SCRIPT_PREAMBLE: shebang through "# Parameters\n" (before TOTAL_SIZE)
  // SCRIPT_BODY: from "# Initialize failed_downloads" through end of script
  var SCRIPT_PREAMBLE = "#!/usr/bin/env bash\n\n#-----------------------------------------------------------------------------\n# AGE-PRO Data Download Script\n# Generated by the AGE-PRO Data Archive\n#\n# AGE-PRO - The ALMA Survey of Gas Evolution in PROtoplanetary Disks\n#\n# This script downloads ALMA data products from the AGE-PRO Large Program.\n#\n# Features:\n# - Parallel downloads: Downloads multiple files simultaneously\n# - Caching: Tracks downloaded files to avoid re-downloading\n# - Automatic retries: Resumes interrupted downloads\n# - Organized structure: Saves files in Region/Disk/Band/Molecule hierarchy\n#\n# Usage:\n#   chmod +x download_script.sh\n#   ./download_script.sh\n#\n# Requirements:\n#   - curl or wget\n#\n#-----------------------------------------------------------------------------\n\n# This script downloads files from specified URLs using wget or curl.\n# It supports resuming interrupted downloads and allows parallel downloads.\n\n# Configuration\nexport TIMEOUT_SECS=300\nexport MAX_RETRIES=3\nexport WAIT_SECS_BEFORE_RETRY=300\nexport MAX_PARALLEL_DOWNLOADS=5\nexport CACHE_FILE=\"downloaded_files_cache.txt\"\nexport DEBUG=false\n\n# Parameters\n";

  var SCRIPT_BODY = "# Initialize failed_downloads counter\nexport failed_downloads=0\n\n# Trap CTRL-C to exit the script\ntrap \"exit\" INT\n\n# Function to log commands if DEBUG is true\ndebug_log() {\n    if [ \"$DEBUG\" = true ]; then\n        echo \"$@\"\n    fi\n}\nexport -f debug_log\n\n# Function to create cache file if it doesn't exist\ncreate_cache_file() {\n    if [ ! -f \"${CACHE_FILE}\" ]; then\n        touch \"${CACHE_FILE}\"\n        debug_log \"Created cache file: ${CACHE_FILE}\"\n    fi\n}\nexport -f create_cache_file\n\n# Function to update cache\nupdate_cache() {\n    local file=$1\n    echo \"$file\" >>\"${CACHE_FILE}\"\n    debug_log \"Updated cache file with: $file\"\n}\nexport -f update_cache\n\n# Function to download a single file with retries\ndownload() {\n    local file=$1\n    local target_dir=$2\n    local filename=$(basename \"$file\")\n    local attempt_num=0\n\n    debug_log \"Checking if file $file is already downloaded\"\n    # Check if the file is already downloaded\n    if grep -q \"$file\" \"${CACHE_FILE}\"; then\n        echo \"File $filename already downloaded. Skipping.\"\n        return 0\n    fi\n\n    # Wait before starting to stagger the load\n    sleep $((($RANDOM % 10) + 2))s\n\n    # Determine download tool\n    local tool_name=\"\"\n    local download_command=()\n    if command -v \"curl\" >/dev/null 2>&1; then\n        tool_name=\"curl\"\n        download_command=(curl -S -s -k -O -f --speed-limit 1 --speed-time ${TIMEOUT_SECS})\n    elif command -v \"wget\" >/dev/null 2>&1; then\n        tool_name=\"wget\"\n        download_command=(wget -c -q -nv --timeout=${TIMEOUT_SECS} --tries=1)\n    fi\n\n    if [ -z \"$tool_name\" ]; then\n        echo \"ERROR: No download tool found (wget or curl).\"\n        exit 1\n    fi\n\n    echo \"Starting download of $filename\"\n    # Retry logic\n    until [ ${attempt_num} -ge ${MAX_RETRIES} ]; do\n        debug_log \"Running command: ${download_command[@]} \\\"$file\\\"\"\n        \"${download_command[@]}\" \"$file\"\n        status=$?\n        if [ ${status} -eq 0 ]; then\n            echo \"--Successfully downloaded $filename\"\n\n            debug_log \"Moving $filename to $target_dir\"\n            mv \"$filename\" \"$target_dir\"\n\n            debug_log \"Updating cache with $file\"\n            update_cache \"$file\"\n            break\n        else\n            failed_downloads=1\n            echo \"Download $filename was interrupted with error code ${tool_name}/${status}\"\n            attempt_num=$((attempt_num + 1))\n            if [ ${attempt_num} -ge ${MAX_RETRIES} ]; then\n                echo \"ERROR: Giving up on downloading $filename after ${MAX_RETRIES} attempts.\"\n            else\n                echo \"Download $filename will automatically resume after ${WAIT_SECS_BEFORE_RETRY} seconds\"\n                sleep ${WAIT_SECS_BEFORE_RETRY}\n                echo \"Resuming download of $filename, attempt $((${attempt_num} + 1))\"\n            fi\n        fi\n    done\n}\nexport -f download\n\n# Function to limit the number of concurrent jobs\nlimit_jobs() {\n    while [ \"$(jobs | wc -l)\" -ge \"${MAX_PARALLEL_DOWNLOADS}\" ]; do\n        sleep 1\n    done\n}\nexport -f limit_jobs\n\n# Function to download files\ndownload_files() {\n    debug_log \"Downloading files in parallel\"\n\n    # Download files in parallel with job control\n    for ((i=0; i<${#DOWNLOAD_URLS[@]}; i++)); do\n        limit_jobs\n        (\n            download \"${DOWNLOAD_URLS[$i]}\" \"${DOWNLOAD_TARGETS[$i]}\"\n        ) &\n    done\n\n    # Wait for all background jobs to complete\n    wait\n}\nexport -f download_files\n\n# Function to check if download tool is available\ncheck_download_tool() {\n    if ! (command -v \"wget\" >/dev/null 2>&1 || command -v \"curl\" >/dev/null 2>&1); then\n        echo \"ERROR: neither 'wget' nor 'curl' are available on your computer. Please install one of them.\"\n        exit 1\n    fi\n    debug_log \"Checked download tools: wget and curl\"\n}\nexport -f check_download_tool\n\n# Function to create directories following the region/disk/band/molecule structure\ncreate_directories() {\n    for dir in \"${DOWNLOAD_TARGETS[@]}\"; do\n        mkdir -p \"$dir\"\n    done\n}\nexport -f create_directories\n\n# Function to print download info\nprint_download_info() {\n    echo \"Downloading the following files in up to 5 parallel streams. Total size is ${TOTAL_SIZE}.\"\n    for url in \"${DOWNLOAD_URLS[@]}\"; do\n        echo \"$url\"\n    done\n    echo \"In case of errors each download will be automatically resumed up to 3 times after a 5 minute delay.\"\n    echo \"To manually resume interrupted downloads just re-run the script.\"\n    echo \"Your downloads will start shortly....\"\n}\nexport -f print_download_info\n\n# Main script execution\ncheck_download_tool\ncreate_cache_file\n\necho \"Creating directories...\"\ncreate_directories\n\nprint_download_info\ndownload_files\n\necho \"Download script execution completed.\"\n";

  function generateScript() {
    var selectedRecords = [];
    state.selectedIds.forEach(function (id) {
      selectedRecords.push(AGEPRO_DATA[id]);
    });
    if (selectedRecords.length === 0) return null;

    var totalMB = selectedRecords.reduce(function (sum, r) { return sum + r.sizeMB; }, 0);
    var totalSizeStr = totalMB >= 1000
      ? (totalMB / 1000).toFixed(1) + " GB"
      : totalMB.toFixed(1) + " MB";

    var now = new Date();
    var timestamp = formatTimestamp(now);

    // Insert timestamp into preamble header
    var preamble = SCRIPT_PREAMBLE.replace(
      "# Generated by the AGE-PRO Data Archive\n",
      "# Generated by the AGE-PRO Data Archive\n# Generated on: " + timestamp + "\n"
    );

    // Build the dynamic section
    var dynamic = "TOTAL_SIZE=\"Total size: " + totalSizeStr + "\"\n";
    dynamic += "DOWNLOAD_URLS=()\n";
    dynamic += "DOWNLOAD_TARGETS=()\n";
    selectedRecords.forEach(function (r) {
      dynamic += "DOWNLOAD_URLS+=(\"" + r.url + "\")\n";
      dynamic += "DOWNLOAD_TARGETS+=(\"" + r.targetDir + "\")\n";
    });

    return preamble + dynamic + "\n" + SCRIPT_BODY;
  }

  function downloadScript() {
    var content = generateScript();
    if (!content) return;

    var timestamp = formatTimestamp(new Date());
    var filename = "download_data_" + timestamp + ".sh";

    var blob = new Blob([content], { type: "application/x-sh" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Event Binding & Init
  // ---------------------------------------------------------------------------
  function init() {
    buildFilterUI();
    applyFilters();

    // Table row checkbox delegation
    document.getElementById("results-body").addEventListener("change", function (e) {
      if (e.target.classList.contains("row-checkbox")) {
        onRowCheckboxChange(e);
      }
    });

    // Header checkbox
    document.getElementById("select-all-checkbox").addEventListener("change", function (e) {
      if (e.target.checked) {
        selectAllShown();
      } else {
        // Deselect only the shown items
        state.filteredData.forEach(function (r) { state.selectedIds.delete(r.id); });
        renderTable();
        updateSummary();
        updateGenerateButton();
        updateWorkflowSteps();
      }
    });

    // Action buttons
    document.getElementById("btn-select-all-shown").addEventListener("click", selectAllShown);
    document.getElementById("btn-deselect-all").addEventListener("click", deselectAll);
    document.getElementById("btn-generate").addEventListener("click", downloadScript);

    // Reset all filters
    document.getElementById("btn-reset-filters").addEventListener("click", resetAllFilters);

    // Sortable column headers
    document.getElementById("results-table").querySelector("thead").addEventListener("click", onSortClick);

    // Collapsible filter groups
    document.querySelectorAll(".filter-group h3").forEach(function (h3) {
      h3.addEventListener("click", function () {
        h3.closest(".filter-group").classList.toggle("collapsed");
      });
    });

    // Empty state reset button
    document.getElementById("btn-empty-reset").addEventListener("click", resetAllFilters);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
