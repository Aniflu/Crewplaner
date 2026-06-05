// Entry point for admin.html
import { SUPABASE_ENABLED } from './config.js';
import './state.js';
import './pb.js';
import './utils.js';
import './types.js';
import './plans.js';
import './logos.js';
import './calendar.js';
import './pdf.js';
import './emailLog.js';
import './crewNotify.js';
import './crewLink.js';
import './dialog.js';
import { pbGet, pbPost, pbPatch, pbDelete, pbList } from './pb.js';
import { renderEmailLog } from './emailLog.js';
import { loadAssignmentStatuses, loadCrewMeta } from './dataService.js';
import { exportPDF } from './pdf.js';
import { generateICS as adminGenerateICS } from './calendar.js';

// Admin.html has its own inline bootstrap script for auth.
// This entry point ensures all modules are loaded and their functions are available.
// The inline <script> in admin.html calls renderEmailLog(), exportPDF(), etc. as globals.
// Since modules don't pollute window, expose needed functions explicitly:
window.renderEmailLog = renderEmailLog;
window.exportPDF = exportPDF;
window.adminGenerateICS = adminGenerateICS;
window.pbGet = pbGet;
window.pbPost = pbPost;
window.pbPatch = pbPatch;
window.pbDelete = pbDelete;
window.pbList = pbList;
window.loadAssignmentStatuses = loadAssignmentStatuses;
window.loadCrewMeta = loadCrewMeta;
