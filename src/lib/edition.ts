/**
 * Welche Ausgabe wird gebaut?
 *  – „site“ (Standard): die bisherige private StudySpace-Seite ohne Anmeldung
 *  – „app“: die neue kommerzielle App mit Konten, Lerngruppen und Plus
 * Vite ersetzt den Wert beim Bauen; nicht benötigter Code entfällt.
 */
export const IS_APP = import.meta.env.VITE_EDITION === 'app';

/**
 * Datei-Uploads („Materialien“, Anhänge an Lerntagen, Hausaufgaben, Fächern).
 * Seit 4.3 in beiden Ausgaben aus: kostet viel Speicher und wird nicht gebraucht.
 * Vorhandene Dateien bleiben im Speicher und in Sicherungen erhalten – sie werden nur nicht mehr angezeigt.
 */
export const FILES_ENABLED = false;
