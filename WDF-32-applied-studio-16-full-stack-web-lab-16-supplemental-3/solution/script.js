const ACTION_BUTTON_SELECTOR = "#action";
const ENTRIES_LIST_SELECTOR = "#entries";
const ENTRY_LABEL_PREFIX = "Entry";
const ENTRY_MESSAGE = "module checkpoint recorded";

const action_button = document.querySelector(ACTION_BUTTON_SELECTOR);
const entries_list = document.querySelector(ENTRIES_LIST_SELECTOR);

let entry_count = 0;

/**
 * @brief Append one numbered checkpoint entry to the page
 */
function append_entry() {
	entry_count += 1;

	const item = document.createElement("li");
	item.textContent = `${ENTRY_LABEL_PREFIX} ${entry_count}: ${ENTRY_MESSAGE}.`;
	entries_list.append(item);
}

// Wire the page action when the required elements are present
if (action_button instanceof HTMLButtonElement && entries_list instanceof HTMLUListElement) {
	action_button.addEventListener("click", append_entry);
}
