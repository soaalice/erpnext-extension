// frappe.pages['reset-datas'].on_page_load = function(wrapper) {
//     var page = frappe.ui.make_app_page({
//         parent: wrapper,
//         title: 'Reset Datas',
//         single_column: true
//     });

//     page.add_menu_item(__('View Official DocType List'), function () {
//         frappe.set_route('List', 'DocType');
//     });

// };

frappe.pages['reset-datas'].on_page_load = function (wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Reset Datas',
        single_column: true
    });

    page.main.html(`
        <div class="reset-datas-container">
            <div class="filter-section mb-3"></div>
            <div class="loading-state text-center p-5" style="display: none;">
                <div class="text-muted">
                    <i class="fa fa-spinner fa-spin fa-2x"></i>
                    <p>${__('Chargement des données...')}</p>
                </div>
            </div>
            <div class="list-view-section"></div>
        </div>
    `);

    new ResetDatasPage(page);
}

frappe.pages['reset-datas'].on_page_show = function (wrapper) {
    if (!frappe.reset_datas_page_loaded) {
        frappe.reset_datas_page_loaded = true;
    }
}

class ResetDatasPage {
    constructor (page) {
        this.page = page;
        this.current_page = 1;
        this.page_length = 10;
        this.setup_filters();
        this.setup_actions();
        this.setup_listview();
        this.load_modules();
    }

    setup_filters() {
        this.filter_area = this.page.main.find('.filter-section');

        this.module_field = frappe.ui.form.make_control({
            parent: this.filter_area,
            df: {
                fieldtype: 'Link',
                fieldname: 'module',
                options: 'Module Def',
                label: 'Module',
                change: () => {
                    this.module = this.module_field.get_value();
                    this.current_page = 1;
                    this.refresh();
                }
            },
            render_input: true
        });
        this.module_field.refresh();

        this.search_field = frappe.ui.form.make_control({
            parent: this.filter_area,
            df: {
                fieldtype: 'Data',
                fieldname: 'search',
                label: 'Recherche',
                placeholder: 'Rechercher...',
                change: () => {
                    this.current_page = 1;
                    this.refresh();
                }
            },
            render_input: true
        });
        this.search_field.refresh();

        this.filter_area.addClass('d-flex flex-wrap gap-3 align-items-end');
    }

    setup_actions() {
        this.page.set_secondary_action(__('Actualiser'), () => this.refresh(), 'refresh');
        this.page.add_menu_item(__('Réinitialiser sélection'), () => this.reset_selected(), true);
        this.page.add_menu_item(__('Exporter'), () => this.export_data(), true);
        this.page.set_primary_action(__('Réinitialiser tout'), () => this.reset_all(), 'octicon octicon-sync');
    }

    setup_listview() {
        this.list_container = this.page.main.find('.list-view-section');
        this.initialize_listview();
    }

    initialize_listview() {
        this.list_container.empty();

        this.listview = new CustomListView({
            parent: this.list_container,
            page: this.page,
            show_filters: false,
            custom_buttons: this.get_custom_buttons(),
            onRowSelection: (selected_docs) => {
                this.selected_docs = selected_docs;
                this.update_actions_state();
            }
        });
    }

    get_custom_buttons() {
        return [
            {
                label: __('Reset'),
                action: (doc) => this.reset_doc(doc),
                condition: (doc) => doc.status !== 'Draft'
            },
            {
                label: __('Voir'),
                action: (doc) => frappe.set_route('Form', doc.doctype, doc.name)
            }
        ];
    }

    update_actions_state() {
        const has_selection = this.selected_docs && this.selected_docs.length > 0;
        this.page.menu_btn_group.find('[data-label="Réinitialiser sélection"]')
            .toggleClass('disabled', !has_selection);
    }

    load_modules() {
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Module Def',
                filters: {
                    'restrict_to_domain': ['in', ['', 'All', 'ERPNext']],
                },
                fields: ['name'],
                order_by: 'name asc'
            },
            callback: (r) => {
                if (r.message && r.message.length) {
                    this.module_field.set_value(r.message[0].name);
                }
            }
        });
    }

    refresh() {
        const module = this.module_field.get_value();
        if (module) {
            this.show_loading();
            this.get_data_for_module(module);
        }
    }

    get_data_for_module(module) {
        this.show_loading();
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'DocType',
                filters: {
                    module: module,
                    issingle: 0,
                    istable: 0
                },
                fields: ['name'],
                limit_page_length: 500,
                order_by: 'name asc'
            },
            callback: (r) => {
                if (r.message && r.message.length) {
                    this.available_doctypes = r.message.map(d => d.name);
                    this.load_data_for_current_page();
                } else {
                    this.available_doctypes = [];
                    this.hide_loading();
                    this.listview.render_list([]);
                }
            }
        });
    }

    load_data_for_current_page() {
        const search = this.search_field.get_value();
        const start = (this.current_page - 1) * this.page_length;
        const doctype_batch = this.available_doctypes.slice(start, start + this.page_length);

        this.fetch_documents_for_doctypes(doctype_batch, search);
    }

    fetch_documents_for_doctypes(doctypes, search) {
        if (!doctypes.length) {
            this.hide_loading();
            this.listview.render_list([]);
            return;
        }

        let all_data = [];
        let completed = 0;

        doctypes.forEach(doctype => {
            let filters = [];
            if (search) {
                filters.push(['name', 'like', `%${search}%`]);
            }

            frappe.call({
                method: 'frappe.desk.reportview.get_list',
                args: {
                    doctype: doctype,
                    fields: ['name', 'modified', 'docstatus'],
                    filters: filters,
                    limit: 100,
                    order_by: 'modified desc'
                },
                callback: (r) => {
                    completed++;

                    if (r.message && r.message.length) {
                        const docs = r.message.map(doc => {
                            doc.doctype = doctype;
                            return doc;
                        });
                        all_data = all_data.concat(docs);
                    }

                    if (completed === doctypes.length) {
                        this.hide_loading();
                        this.listview.render_list(all_data);
                        this.render_pagination();
                    }
                }
            });
        });
    }

    render_pagination() {
        const total_pages = Math.ceil(this.available_doctypes.length / this.page_length);

        if (total_pages <= 1) {
            this.list_container.find('.pagination-area').remove();
            return;
        }

        this.list_container.find('.pagination-area').remove();

        const pagination = $(`
            <div class="pagination-area text-center mt-4">
                <div class="btn-group">
                    <button class="btn btn-default btn-sm btn-prev">
                        <i class="fa fa-chevron-left"></i>
                    </button>
                    <button class="btn btn-default btn-sm btn-page-info">
                        ${__('Page {0} sur {1}', [this.current_page, total_pages])}
                    </button>
                    <button class="btn btn-default btn-sm btn-next">
                        <i class="fa fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `).appendTo(this.list_container);

        pagination.find('.btn-prev').on('click', () => {
            if (this.current_page > 1) {
                this.current_page--;
                this.load_data_for_current_page();
            }
        });

        pagination.find('.btn-next').on('click', () => {
            if (this.current_page < total_pages) {
                this.current_page++;
                this.load_data_for_current_page();
            }
        });

        // Désactiver les boutons si nécessaire
        if (this.current_page === 1) {
            pagination.find('.btn-prev').addClass('disabled');
        }

        if (this.current_page === total_pages) {
            pagination.find('.btn-next').addClass('disabled');
        }
    }

    show_loading() {
        this.page.main.find('.loading-state').show();
        this.page.main.find('.list-view-section').hide();
    }

    hide_loading() {
        this.page.main.find('.loading-state').hide();
        this.page.main.find('.list-view-section').show();
    }

    reset_doc(doc) {
        frappe.confirm(
            __('Êtes-vous sûr de vouloir réinitialiser "{0}" ({1})?', [doc.name, doc.doctype]),
            () => {
                frappe.call({
                    method: "my_app.my_module.reset_doc_data",
                    args: {
                        doctype: doc.doctype,
                        name: doc.name
                    },
                    callback: (r) => {
                        if (r.message) {
                            frappe.show_alert({
                                message: __('Document réinitialisé avec succès'),
                                indicator: 'green'
                            });
                            this.refresh();
                        }
                    }
                });
            }
        );
    }

    reset_selected() {
        if (!this.selected_docs || !this.selected_docs.length) {
            frappe.throw(__('Aucun document sélectionné'));
            return;
        }

        frappe.confirm(
            __('Êtes-vous sûr de vouloir réinitialiser {0} documents?', [this.selected_docs.length]),
            () => {
                const docs_by_type = {};
                this.selected_docs.forEach(doc => {
                    if (!docs_by_type[doc.doctype]) {
                        docs_by_type[doc.doctype] = [];
                    }
                    docs_by_type[doc.doctype].push(doc.name);
                });

                let completed = 0;
                const total = Object.keys(docs_by_type).length;

                Object.entries(docs_by_type).forEach(([doctype, names]) => {
                    frappe.call({
                        method: "my_app.my_module.reset_multiple_docs",
                        args: {
                            doctype: doctype,
                            names: names
                        },
                        callback: (r) => {
                            completed++;
                            if (completed === total && r.message) {
                                frappe.show_alert({
                                    message: __('Documents réinitialisés avec succès'),
                                    indicator: 'green'
                                });
                                this.refresh();
                            }
                        }
                    });
                });
            }
        );
    }

    reset_all() {
        const module = this.module_field.get_value();
        if (!module) {
            frappe.throw(__('Veuillez sélectionner un module'));
            return;
        }

        frappe.confirm(
            __('Êtes-vous sûr de vouloir réinitialiser TOUS les documents du module {0}?', [module]),
            () => {
                frappe.call({
                    method: "my_app.my_module.reset_module_data",
                    args: {
                        module: module
                    },
                    callback: (r) => {
                        if (r.message) {
                            frappe.show_alert({
                                message: __('Tous les documents ont été réinitialisés avec succès'),
                                indicator: 'green'
                            });
                            this.refresh();
                        }
                    }
                });
            }
        );
    }

    export_data() {
        const module = this.module_field.get_value();
        if (!module) {
            frappe.throw(__('Veuillez sélectionner un module'));
            return;
        }

        frappe.set_route('data-export-tool', {
            module: module
        });
    }
}

class CustomListView {
    constructor (opts) {
        Object.assign(this, opts);
        this.make();
    }

    make() {
        this.wrapper = $('<div class="custom-list-view"></div>').appendTo(this.parent);
        this.setup_header();
        this.setup_body();
        this.add_styles();
    }

    add_styles() {
        // Ajout des styles CSS pour corriger la disposition du tableau
        $(`<style>
            .custom-list-view {
                width: 100%;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                overflow: hidden;
            }
            .list-view-header {
                background-color: var(--control-bg);
                border-bottom: 1px solid var(--border-color);
                font-weight: bold;
            }
            .list-row {
                display: flex;
                align-items: center;
                padding: 8px 15px;
                border-bottom: 1px solid var(--border-color);
            }
            .list-row:last-child {
                border-bottom: none;
            }
            .list-row-container:hover {
                background-color: var(--highlight-color);
                cursor: pointer;
            }
            .list-col {
                padding: 8px 10px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .list-col-checkbox {
                width: 30px;
                flex-shrink: 0;
            }
            .list-col:nth-child(2) {
                width: 15%;
                flex-shrink: 0;
            }
            .list-col:nth-child(3) {
                width: 20%;
                flex-shrink: 0;
            }
            .list-col:nth-child(4) {
                width: 20%;
                flex-shrink: 0;
            }
            .list-col:nth-child(5) {
                width: 12%;
                flex-shrink: 0;
            }
            .list-col:nth-child(6) {
                width: 15%;
                flex-shrink: 0;
            }
            .list-col-actions {
                width: 18%;
                flex-shrink: 0;
                text-align: right;
            }
            .no-result {
                padding: 30px;
                text-align: center;
            }
            .indicator {
                display: inline-block;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                margin-right: 5px;
            }
            .indicator.green { background-color: #98d85b; }
            .indicator.blue { background-color: #5e64ff; }
            .indicator.orange { background-color: #ffa00a; }
            .indicator.red { background-color: #ff5858; }
            .indicator.gray { background-color: #b8c2cc; }
        </style>`).appendTo(this.wrapper);
    }

    setup_header() {
        this.header = $(`
            <div class="list-view-header">
                <div class="list-row list-row-head">
                    <div class="list-col-checkbox">
                        <input type="checkbox" class="select-all">
                    </div>
                    <div class="list-col">Type</div>
                    <div class="list-col">ID</div>
                    <div class="list-col">Nom</div>
                    <div class="list-col">Statut</div>
                    <div class="list-col text-right">Dernière modification</div>
                    <div class="list-col list-col-actions">Actions</div>
                </div>
            </div>
        `).appendTo(this.wrapper);

        this.header.find('.select-all').on('change', (e) => {
            const checked = $(e.target).prop('checked');
            this.body.find('.list-row-checkbox').prop('checked', checked).trigger('change');
        });
    }

    setup_body() {
        this.body = $('<div class="list-view-body"></div>').appendTo(this.wrapper);
    }

    render_list(data) {
        this.body.empty();

        if (!data || !data.length) {
            this.body.html(`
                <div class="no-result text-center p-5">
                    <div class="text-muted">
                        <i class="fa fa-search" style="font-size: 48px; opacity: 0.5;"></i>
                        <p class="mt-2">${__('Aucun résultat trouvé')}</p>
                    </div>
                </div>
            `);
            return;
        }

        data.forEach(doc => {
            this.add_row(doc);
        });

        this.setup_selection();

        this.body.append(`
            <div class="list-count mt-3 px-3 py-2 text-muted">
                <span>${data.length} ${data.length === 1 ? __('enregistrement') : __('enregistrements')}</span>
            </div>
        `);
    }

    add_row(doc) {
        const modified = frappe.datetime.prettyDate(doc.modified);

        const row = $(`
            <div class="list-row-container" data-name="${doc.name}" data-doctype="${doc.doctype}">
                <div class="list-row">
                    <div class="list-col-checkbox">
                        <input type="checkbox" class="list-row-checkbox" data-name="${doc.name}" data-doctype="${doc.doctype}">
                    </div>
                    <div class="list-col">
                        <span class="text-muted">${doc.doctype}</span>
                    </div>
                    <div class="list-col">${doc.name}</div>
                    <div class="list-col">${doc.title || doc.name}</div>
                    <div class="list-col">${this.get_status_html(doc)}</div>
                    <div class="list-col text-muted text-right" title="${doc.modified}">
                        ${modified}
                    </div>
                    <div class="list-col list-col-actions">${this.get_actions_html(doc)}</div>
                </div>
            </div>
        `).appendTo(this.body);

        row.find('.btn-action').on('click', (e) => {
            const action = $(e.currentTarget).attr('data-action');
            const actionFn = this.custom_buttons.find(btn => btn.label === action).action;
            if (actionFn) actionFn(doc);
            e.stopPropagation();
        });

        row.on('click', () => {
            frappe.set_route('Form', doc.doctype, doc.name);
        });
    }

    get_status_html(doc) {
        const status = doc.status || (doc.docstatus === 0 ? 'Draft' :
            doc.docstatus === 1 ? 'Submitted' : 'Cancelled');

        const colors = {
            'Draft': 'gray',
            'Submitted': 'blue',
            'Cancelled': 'red',
            'Completed': 'green',
            'In Progress': 'orange'
        };

        const color = colors[status] || 'gray';

        return `<span class="indicator ${color}">${__(status)}</span>`;
    }

    get_actions_html(doc) {
        let html = '';

        this.custom_buttons.forEach(btn => {
            if (!btn.condition || btn.condition(doc)) {
                const btnClass = btn.class || 'btn-default';
                const icon = btn.icon ? `<i class="${btn.icon} mr-1"></i>` : '';

                html += `<button class="btn btn-xs ${btnClass} btn-action mr-1" data-action="${btn.label}">${icon}${__(btn.label)}</button>`;
            }
        });

        return html;
    }

    setup_selection() {
        this.selected_docs = [];

        this.body.find('.list-row-checkbox').on('change', (e) => {
            const $checkbox = $(e.target);
            const doc_name = $checkbox.attr('data-name');
            const doc_type = $checkbox.attr('data-doctype');
            const checked = $checkbox.prop('checked');

            const doc = {
                name: doc_name,
                doctype: doc_type,
                title: this.find_doc_title(doc_name, doc_type)
            };

            if (checked) {
                if (!this.selected_docs.find(d => d.name === doc_name && d.doctype === doc_type)) {
                    this.selected_docs.push(doc);
                }
            } else {
                this.selected_docs = this.selected_docs.filter(d => !(d.name === doc_name && d.doctype === doc_type));
            }

            this.update_select_all();

            if (this.onRowSelection) {
                this.onRowSelection(this.selected_docs);
            }
        });
    }

    find_doc_title(name, doctype) {
        const row = this.body.find(`.list-row-container[data-name="${name}"][data-doctype="${doctype}"]`);
        return row.find('.list-col:nth-child(4)').text();
    }

    update_select_all() {
        const total_rows = this.body.find('.list-row-checkbox').length;
        const selected_rows = this.selected_docs.length;

        this.header.find('.select-all').prop('checked',
            total_rows > 0 && selected_rows === total_rows);
    }
}