import Assistant from './pages/Assistant';
import Dashboard from './pages/Dashboard';
import InvoiceConfirmation from './pages/InvoiceConfirmation';
import Documents from './pages/Documents';
import CompanySetup from './pages/CompanySetup';
import Notifications from './pages/Notifications';
import Taxes from './pages/Taxes';
import Settings from './pages/Settings';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Assistant": Assistant,
    "Dashboard": Dashboard,
    "InvoiceConfirmation": InvoiceConfirmation,
    "Documents": Documents,
    "CompanySetup": CompanySetup,
    "Notifications": Notifications,
    "Taxes": Taxes,
    "Settings": Settings,
}

export const pagesConfig = {
    mainPage: "Assistant",
    Pages: PAGES,
    Layout: __Layout,
};