frappe.pages['reset-buying'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Réinitialiser les modules',
        single_column: true
    });

    page.add_inner_button('Réinitialiser module achat', () => {
        frappe.confirm(
            'Êtes-vous sûr de vouloir réinitialiser le module Buying ? Cette action est irréversible.',
            function() {
                frappe.call({
                    method: "erpnext.reset_table.api.reset_buying_module",
                    callback: function(r) {
                        if (!r.exc) {
                            frappe.msgprint({
                                title: __('Succès'),
                                message: __('Le module Buying a été réinitialisé avec succès.'),
                                indicator: 'green'
                            });
                        }
                    }
                });
            }
        );
    });

    page.add_inner_button('Réinitialiser module hr', () => {
        frappe.confirm(
            'Êtes-vous sûr de vouloir réinitialiser le module HR ? Cette action est irréversible.',
            function() {
                frappe.call({
                    method: "erpnext.reset_table.api.reset_payroll_module",
                    callback: function(r) {
                        if (!r.exc) {
                            frappe.msgprint({
                                title: __('Succès'),
                                message: __('Le module Payroll a été réinitialisé avec succès.'),
                                indicator: 'green'
                            });
                        }
                    }
                });
            }
        );
    });
};
