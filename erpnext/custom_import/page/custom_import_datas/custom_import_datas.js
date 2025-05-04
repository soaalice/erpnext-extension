frappe.pages['custom-import-datas'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Custom Import',
        single_column: true
    });

    // Ajout du formulaire d'import
    let import_form = new ImportForm({
        parent: page.main,
    });
}

class ImportForm {
    constructor(opts) {
        Object.assign(this, opts);
        this.make();
    }

    make() {
        this.form = new frappe.ui.FieldGroup({
            parent: this.parent,
            fields: [
                {
                    label: 'Select CSV File',
                    fieldname: 'csv_file',
                    fieldtype: 'Attach',
                    reqd: 1,
                    options: 'csv'
                },
                {
                    label: 'Import',
                    fieldname: 'import',
                    fieldtype: 'Button',
                    click: () => this.import_data()
                }
            ]
        });
        this.form.make();
    }

    import_data() {
        if (!this.form.get_value('csv_file')) {
            frappe.throw(__('Please select a CSV file'));
            return;
        }

        frappe.call({
            method: 'erpnext.custom_import.custom_import.import_csv',
            args: {
                file_url: this.form.get_value('csv_file')
            },
            callback: (r) => {
                if (!r.exc) {
                    frappe.msgprint(__('Import successful'));
                    this.form.get_field('csv_file').set_value('');
                }
            }
        });
    }
}