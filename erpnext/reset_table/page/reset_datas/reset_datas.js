frappe.pages['reset-datas'].on_page_load = function (wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Reset DocTypes by Module',
        single_column: true
    });

    if (!frappe.reset_datas_styles_added) {
        $(`<style>
            .reset-datas-container .filter-section {
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                margin-bottom: 15px;
                align-items: flex-end;
            }
            .reset-datas-container .list-row {
                display: flex;
                align-items: center;
                padding: 8px 15px;
                border-bottom: 1px solid var(--border-color);
            }
            .reset-datas-container .list-row-head {
                background-color: var(--control-bg);
                font-weight: bold;
            }
            .reset-datas-container .list-col {
                padding: 8px 10px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .reset-datas-container .list-col-checkbox { width: 30px; }
            .reset-datas-container .list-col-doctype { width: 30%; }
            .reset-datas-container .list-col-module { width: 20%; }
            .reset-datas-container .list-col-custom { width: 15%; }
            .reset-datas-container .list-col-count { width: 15%; }
            .reset-datas-container .list-col-actions { 
                width: 20%; 
                text-align: right;
            }
            .reset-datas-pagination {
                display: flex;
                justify-content: center;
                margin-top: 15px;
            }
        </style>`).appendTo('head');
        frappe.reset_datas_styles_added = true;
    }

    page.main.html(`
        <div class="reset-datas-container">
            <div class="filter-section"></div>
            <div class="loading-state text-center p-5" style="display: none;">
                <div class="text-muted">
                    <i class="fa fa-spinner fa-spin fa-2x"></i>
                    <p>${__('Chargement des données...')}</p>
                </div>
            </div>
            <div class="list-view-section"></div>
            <div class="reset-datas-pagination"></div>
        </div>
    `);

    frappe.reset_datas = new frappe.views.ResetDatasView({
        parent: page,
        page: page,
        list_container: page.main.find('.list-view-section')
    });
};

frappe.pages['reset-datas'].on_page_show = function (wrapper) {
    if (frappe.reset_datas) {
        frappe.reset_datas.refresh();
    }
};

frappe.views.ResetDatasView = class ResetDatasView {
    constructor (opts) {
        Object.assign(this, opts);
        this.current_page = 1;
        this.page_length = 20;
        this.module = null;
        this.selected_doctypes = [];
        this.setup_filters();
        this.setup_actions();
        this.load_modules();
    }

    setup_filters() {
        this.filter_area = this.parent.main.find('.filter-section');

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
                label: 'Rechercher DocType',
                placeholder: 'Rechercher...',
                change: () => {
                    this.current_page = 1;
                    this.refresh();
                }
            },
            render_input: true
        });
        this.search_field.refresh();
    }

    setup_actions() {
        this.page.set_secondary_action(__('Actualiser'), () => this.refresh(), 'refresh');
        // this.page.add_menu_item(__('Voir les documents'), () => this.view_documents(), true);
        this.page.add_menu_item(__('Réinitialiser les documents'), () => this.reset_documents(), true);
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
            this.get_doctypes_for_module(module);
        }
    }

    get_doctypes_for_module(module) {
        this.show_loading();

        let filters = {
            module: module,
            issingle: 0,
            istable: 0
        };

        const search = this.search_field.get_value();
        if (search) {
            filters.name = ['like', `%${search}%`];
        }

        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'DocType',
                filters: filters,
                fields: ['name', 'module', 'custom', 'description'],
                limit_page_length: 0,
                order_by: 'name asc'
            },
            callback: (r) => {
                this.hide_loading();
                if (r.message && r.message.length) {
                    this.all_doctypes = r.message;
                    this.render_list(this.all_doctypes);
                    this.render_pagination();
                } else {
                    this.all_doctypes = [];
                    this.render_empty_state();
                }
            }
        });
    }

    render_list(doctypes) {
        this.list_container.empty();

        if (!doctypes || !doctypes.length) {
            this.render_empty_state();
            return;
        }

        const header = $(`
            <div class="list-row list-row-head">
                <div class="list-col list-col-checkbox">
                    <input type="checkbox" class="select-all">
                </div>
                <div class="list-col list-col-doctype">${__('DocType')}</div>
                <div class="list-col list-col-module">${__('Module')}</div>
                <div class="list-col list-col-custom">${__('Personnalisé')}</div>
                <div class="list-col list-col-count">${__('Documents')}</div>
                <div class="list-col list-col-actions">${__('Actions')}</div>
            </div>
        `).appendTo(this.list_container);

        const rows_container = $('<div class="list-rows-container"></div>').appendTo(this.list_container);

        doctypes.forEach(doctype => {
            this.add_row(doctype, rows_container);
        });

        this.setup_selection();

        rows_container.append(`
            <div class="list-count mt-3 px-3 py-2 text-muted">
                <span>${doctypes.length} ${doctypes.length === 1 ? __('DocType') : __('DocTypes')}</span>
            </div>
        `);
    }

    add_row(doctype, container) {
        const row = $(`
            <div class="list-row" data-doctype="${doctype.name}">
                <div class="list-col list-col-checkbox">
                    <input type="checkbox" class="list-row-checkbox" data-doctype="${doctype.name}">
                </div>
                <div class="list-col list-col-doctype">
                    <span>${doctype.name}</span>
                    ${doctype.description ? `<div class="text-muted small">${doctype.description}</div>` : ''}
                </div>
                <div class="list-col list-col-module">${doctype.module}</div>
                <div class="list-col list-col-custom">
                    <span class="indicator ${doctype.custom ? 'green' : 'gray'}">
                        ${doctype.custom ? __('Oui') : __('Non')}
                    </span>
                </div>
                <div class="list-col list-col-count">
                    <a href="#" class="text-muted doc-count-link" data-doctype="${doctype.name}">
                        <span class="doc-count">${__('Chargement...')}</span>
                    </a>
                </div>
                <div class="list-col list-col-actions">
                    ${this.get_actions_html(doctype)}
                </div>
            </div>
        `).appendTo(container);

        // Charger le nombre de documents pour ce DocType
        this.load_document_count(doctype.name, row.find('.doc-count'));

        // Ajouter les événements sur les actions
        row.find('.btn-action').on('click', (e) => {
            const action = $(e.currentTarget).attr('data-action');
            if (action === 'view') {
                frappe.set_route('List', doctype.name, 'List');
            } else if (action === 'reset') {
                this.reset_doctype(doctype.name);
            }
            e.stopPropagation();
        });

        // Lien pour voir les documents
        row.find('.doc-count-link').on('click', (e) => {
            e.preventDefault();
            frappe.set_route('List', doctype.name, 'List');
        });

        // Clic sur la ligne
        row.on('click', (e) => {
            if (!$(e.target).is('input[type="checkbox"]') && !$(e.target).is('.btn')) {
                frappe.set_route('Form', 'DocType', doctype.name);
            }
        });
    }

    load_document_count(doctype, element) {
        frappe.call({
            method: 'frappe.client.get_count',
            args: {
                doctype: doctype
            },
            callback: (r) => {
                if (r.message !== undefined) {
                    element.text(r.message);
                } else {
                    element.text('0');
                }
            }
        });
    }

    get_actions_html(doctype) {
        return `
            <button class="btn btn-xs btn-default btn-action mr-1" data-action="view">
                ${__('Liste')}
            </button>
        `;
    }

    setup_selection() {
        this.selected_doctypes = [];

        // Gestion du clic sur "Tout sélectionner"
        this.list_container.find('.select-all').on('change', (e) => {
            const checked = $(e.target).prop('checked');
            this.list_container.find('.list-row-checkbox').prop('checked', checked).trigger('change');
        });

        // Gestion des cases à cocher individuelles
        this.list_container.find('.list-row-checkbox').on('change', (e) => {
            const $checkbox = $(e.target);
            const doctype = $checkbox.attr('data-doctype');
            const checked = $checkbox.prop('checked');

            if (checked) {
                if (!this.selected_doctypes.includes(doctype)) {
                    this.selected_doctypes.push(doctype);
                }
            } else {
                this.selected_doctypes = this.selected_doctypes.filter(d => d !== doctype);
            }

            this.update_actions_state();
        });
    }

    update_actions_state() {
        // Mettre à jour l'état des boutons d'action
        const has_selection = this.selected_doctypes && this.selected_doctypes.length > 0;
        this.page.menu_btn_group.find('[data-label="Voir les documents"]')
            .toggleClass('disabled', !has_selection);
        this.page.menu_btn_group.find('[data-label="Réinitialiser les documents"]')
            .toggleClass('disabled', !has_selection);

        // Mettre à jour l'état du bouton "Tout sélectionner"
        const total_rows = this.list_container.find('.list-row-checkbox').length;
        const selected_rows = this.selected_doctypes.length;

        if (total_rows > 0) {
            this.list_container.find('.select-all').prop('checked', selected_rows === total_rows);
        }
    }

    render_pagination() {
        const total_pages = Math.ceil(this.all_doctypes.length / this.page_length);
        const pagination_container = this.parent.main.find('.reset-datas-pagination');
        pagination_container.empty();

        if (total_pages <= 1) {
            return;
        }

        const pagination = $(`
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
        `).appendTo(pagination_container);

        pagination.find('.btn-prev').on('click', () => {
            if (this.current_page > 1) {
                this.current_page--;
                this.refresh();
            }
        }).toggleClass('disabled', this.current_page === 1);

        pagination.find('.btn-next').on('click', () => {
            if (this.current_page < total_pages) {
                this.current_page++;
                this.refresh();
            }
        }).toggleClass('disabled', this.current_page === total_pages);
    }

    render_empty_state() {
        this.list_container.html(`
            <div class="no-result text-center p-5">
                <div class="text-muted">
                    <i class="fa fa-search" style="font-size: 48px; opacity: 0.5;"></i>
                    <p class="mt-2">${__('Aucun DocType trouvé')}</p>
                </div>
            </div>
        `);
    }

    show_loading() {
        this.parent.main.find('.loading-state').show();
        this.list_container.hide();
        this.parent.main.find('.reset-datas-pagination').hide();
    }

    hide_loading() {
        this.parent.main.find('.loading-state').hide();
        this.list_container.show();
        this.parent.main.find('.reset-datas-pagination').show();
    }

    reset_doctype(doctype) {
        frappe.confirm(
            __('Êtes-vous sûr de vouloir réinitialiser TOUS les documents du DocType "{0}"?', [doctype]),
            () => {
                frappe.call({
                    method: "erpnext.reset_table.api.reset_doctype_data",
                    args: {
                        doctype: doctype
                    },
                    callback: (r) => {
                        if (r.message) {
                            frappe.show_alert({
                                message: r.message.message,
                                indicator: 'green'
                            });
                            this.refresh();
                        }
                    }
                });
            }
        );
    }

    view_documents() {
        if (!this.selected_doctypes || !this.selected_doctypes.length) {
            frappe.throw(__('Aucun DocType sélectionné'));
            return;
        }

        // Ouvrir le premier DocType sélectionné dans une nouvelle fenêtre
        frappe.set_route('List', this.selected_doctypes[0], 'List');
    }

    reset_documents() {
        if (!this.selected_doctypes || !this.selected_doctypes.length) {
            frappe.throw(__('Aucun DocType sélectionné'));
            return;
        }

        frappe.confirm(
            __('Êtes-vous sûr de vouloir réinitialiser TOUS les documents pour {0} DocTypes sélectionnés?', [this.selected_doctypes.length]),
            () => {
                frappe.call({
                    method: "erpnext.reset_table.api.reset_multiple_doctypes",
                    args: {
                        doctypes: this.selected_doctypes
                    },
                    callback: (r) => {
                        if (r.message) {
                            let success_count = 0;
                            let error_count = 0;

                            for (const doctype in r.message) {
                                if (r.message[doctype].success !== false) {
                                    success_count++;
                                } else {
                                    error_count++;
                                }
                            }

                            let msg = __('{0} DocTypes réinitialisés avec succès', [success_count]);
                            if (error_count > 0) {
                                msg += __(', {0} erreurs', [error_count]);
                            }

                            frappe.show_alert({
                                message: msg,
                                indicator: error_count > 0 ? 'orange' : 'green'
                            });
                            this.refresh();
                        }
                    }
                });
            }
        );
    }
};