import frappe
import csv
import io
import json
import pandas
from frappe.utils import nowdate
from datetime import date, timedelta, datetime

@frappe.whitelist()
def import_data(employees_json, structure_json, salary_json):
    try:
        frappe.db.begin()

        holiday_list_name = "weekend"
        if not frappe.db.exists("Holiday List", holiday_list_name):
            holiday_list = frappe.get_doc({
                "doctype": "Holiday List",
                "holiday_list_name": holiday_list_name,
                "from_date": "2025-01-01",
                "to_date": "2025-12-31",
                "holidays": [
                    {
                        "description": "New Year's Day",
                        "holiday_date": "2025-01-01",
                        "weekly_off": False
                    }
                ]
            })
            holiday_list.insert()
            print(f"Created Holiday List: {holiday_list_name}")
        else:
            holiday_list = frappe.get_doc("Holiday List", holiday_list_name)
            print(f"Using existing Holiday List: {holiday_list_name}")

        employees = json.loads(employees_json)
        created_employee_refs = set()  # Track created employee refs
        for employee in employees:
            print(f"Processing employee: {employee}")
            if not frappe.db.exists("Gender", {"gender": employee['gender']}):
                gender = frappe.get_doc({
                    "doctype": "Gender",
                    "gender": employee['gender']
                })
                gender.insert()
            if not frappe.db.exists("Company", {"company_name": employee['company']}):
                company = frappe.get_doc({
                    "doctype": "Company",
                    "company_name": employee['company'],
                    "default_currency": "USD",
                    "country": "Madagascar",
                    "chart_of_accounts": "Standard",
                    "default_holiday_list": holiday_list_name
                })
                company.insert()
            if frappe.db.exists("Employee Ref", {"ref": employee['ref']}):
                frappe.msgprint(f"Employee Ref '{employee['ref']}' already exists, skipping creation.")
                continue
            emp = frappe.get_doc({
                "doctype": "Employee",
                "first_name": employee["first_name"],
                "last_name": employee["last_name"],
                "gender": employee["gender"],
                "date_of_joining": pandas.to_datetime(employee["date_of_joining"]).date(),
                "date_of_birth": pandas.to_datetime(employee["date_of_birth"]).date(),
                "company": employee["company"],
                "holiday_list": holiday_list_name
            }).insert()

            frappe.get_doc({
                "doctype": "Employee Ref",
                "ref": employee['ref'],
                "employee": emp.name
            }).insert()
            created_employee_refs.add(employee['ref'])  # Add to created refs

        structures = json.loads(structure_json)
        for structure in structures:
            print(f"Processing structure: {structure}")
            earnings = []
            deductions = []
            for component in structure["salaryComponents"]:
                if not frappe.db.exists("Salary Component", {"salary_component": component["salary_component"]}):
                    comp = frappe.get_doc({
                        "doctype": "Salary Component",
                        "name": component["salary_component"],
                        "salary_component": component["salary_component"],
                        "salary_component_abbr": component["salary_component_abbr"],
                        "type": component["type"].capitalize(),
                        "amount_based_on_formula": 1,
                        "formula": component["formula"],
                        "depends_on_payment_days": 0
                    })
                    comp.insert()
                else:
                    comp = frappe.get_doc("Salary Component", component["salary_component"])
                if comp.type == "Earning":
                    earnings.append({
                        "salary_component": comp.name,
                        "salary_component_abbr": comp.salary_component_abbr,
                        "amount_based_on_formula": 1,
                        "formula": comp.formula
                    })
                elif comp.type == "Deduction":
                    deductions.append({
                        "salary_component": comp.name,
                        "salary_component_abbr": comp.salary_component_abbr,
                        "amount_based_on_formula": 1,
                        "formula": comp.formula
                    })

            if frappe.db.exists("Salary Structure", structure["name"]):
                frappe.msgprint(f"Salary Structure '{structure['name']}' already exists, skipping creation.")
                continue
            else:
                str_doc = frappe.get_doc({
                    "doctype": "Salary Structure",
                    "name": structure["name"],
                    "salary_structure_name": structure["name"],
                    "company": structure["company"],
                    "is_active": "Yes",
                    "payroll_frequency": "Monthly",
                    "earnings": earnings,
                    "deductions": deductions
                }).insert()
                str_doc.submit()

        salaries = json.loads(salary_json)
        salaries.sort(key=lambda x: (pandas.to_datetime(x["from_date"]).date(), x["employee_ref"]))
        for salary in salaries:
            print(f"Processing salary: {salary}")
            employee_ref_value = salary["employee_ref"]
            if not frappe.db.exists("Employee Ref", {"ref": employee_ref_value}):
                frappe.db.rollback()
                frappe.throw(f"Erreur lors de l'importation: Employee Ref '{employee_ref_value}' n'existe pas")
            employee_ref = frappe.get_doc("Employee Ref", {"ref": employee_ref_value})

            # Validate that the Employee record exists
            if not frappe.db.exists("Employee", employee_ref.employee):
                frappe.db.rollback()
                frappe.throw(f"Erreur lors de l'importation: Employee {employee_ref.employee} referenced by Employee Ref '{employee_ref_value}' not found")

            start_date = pandas.to_datetime(salary["from_date"]).date()
            start_date = start_date.replace(day=1)
            emp = frappe.get_doc("Employee", employee_ref.employee)
            if start_date < emp.date_of_joining:
                frappe.throw(f"Salary Slip start_date {start_date} is before employee {employee_ref.employee} joining date {emp.date_of_joining}")

            if not frappe.db.exists("Fiscal Year", start_date.year):
                frappe.get_doc({
                    "doctype": "Fiscal Year",
                    "year": start_date.year,
                    "year_start_date": f"{start_date.year}-01-01",
                    "year_end_date": f"{start_date.year}-12-31",
                    "is_active": 1,
                    "company": salary["company"]
                }).insert()

            salary_assignment = frappe.get_doc({
                "doctype": "Salary Structure Assignment",
                "employee": employee_ref.employee,
                "salary_structure": salary["salary_structure"],
                "from_date": pandas.to_datetime(start_date).date(),
                "base": salary["base"],
                "company": salary["company"]
            })
            salary_assignment.insert()
            salary_assignment.submit()

            if salary_assignment.from_date.month == 12:
                end_date = salary_assignment.from_date.replace(year=salary_assignment.from_date.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                end_date = salary_assignment.from_date.replace(month=salary_assignment.from_date.month + 1, day=1) - timedelta(days=1)
            print(f"Creating Salary Slip for {employee_ref.employee} from {start_date} to {end_date}")
            salary_slip = frappe.get_doc({
                "doctype": "Salary Slip",
                "employee": salary_assignment.employee,
                "start_date": pandas.to_datetime(start_date).date(),
                "end_date": pandas.to_datetime(end_date).date(),
                "payroll_frequency": "Monthly",
                "company": salary_assignment.company,
                "posting_date": pandas.to_datetime(start_date).date()
            })
            salary_slip.insert()
            salary_slip.submit()

        frappe.db.commit()
        print("Importation terminée.")
        return {"message": "OK"}

    except Exception as e:
        frappe.db.rollback()
        error_msg = f"Erreur lors de l'importation: {str(e)}"
        frappe.log_error(frappe.get_traceback(), error_msg)
        frappe.throw(error_msg)