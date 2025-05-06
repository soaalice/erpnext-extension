frappe.pages['custom-multi-import'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Custom Multi Import',
        single_column: true
    });

    let form = new MultiImportForm(page);
    form.init();
}

class MultiImportForm {
    constructor(page) {
        this.page = page;
        this.wrapper = $(page.body);
    }

    init() {
        this.make_form();
        this.bind_events();
    }

    make_form() {
        this.form = new frappe.ui.FieldGroup({
            fields: [
                {
                    label: 'Supplier CSV',
                    fieldname: 'supplier_csv',
                    fieldtype: 'Attach',
                    reqd: 1,
                    description: 'Format: supplier_name, country, type'
                },
                {
                    label: 'Request for Quotation CSV',
                    fieldname: 'rfq_csv',
                    fieldtype: 'Attach',
                    reqd: 1,
                    description: 'Format: date, item_name, item_groupe, required_by, quantity, purpose, target_warehouse, ref'
                },
                {
                    label: 'RFQ Supplier CSV',
                    fieldname: 'rfq_supplier_csv',
                    fieldtype: 'Attach',
                    reqd: 1,
					description: 'Format: ref, supplier'
                },
                {
                    label: 'Import',
                    fieldname: 'import_button',
                    fieldtype: 'Button',
                    click: () => this.handle_import()
                }
            ],
            body: this.wrapper
        });
        this.form.make();
    }

    bind_events() {
    }

    handle_import() {
        if (!this.form.get_value('supplier_csv') 
			|| !this.form.get_value('rfq_csv') 
			|| !this.form.get_value('rfq_supplier_csv')
			) {
            frappe.msgprint(__('Please attach all required files'));
            return;
        }

        frappe.call({
            method: 'erpnext.custom_import.custom_import.process_multi_import',
            args: {
                supplier_csv: this.form.get_value('supplier_csv'),
                rfq_csv: this.form.get_value('rfq_csv'),
                rfq_supplier_csv: this.form.get_value('rfq_supplier_csv')
            },
            freeze: true,
            freeze_message: __('Processing Import...'),
            callback: (r) => {
                if (!r.exc) {
                    frappe.msgprint(__('Import completed successfully'));
                }
            }
        });
    }
}