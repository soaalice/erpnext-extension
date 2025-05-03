frappe.pages['custom-import-datas'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Custom Import Datas',
		single_column: true
	});
}