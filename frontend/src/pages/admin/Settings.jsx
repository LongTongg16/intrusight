import ThemePicker from "../../components/ThemePicker";
import { PageHeader } from "../../components/ui";
import "./admin.css";

function Settings() {
  return (
    <>
      <PageHeader
        title="Appearance"
        subtitle="Theme preference is stored in this browser only. It does not affect other users or other devices."
      />

      <section className="ops" aria-labelledby="theme-heading">
        <div className="ops__head">
          <h2 className="ops__title" id="theme-heading">Dashboard theme</h2>
        </div>
        <div className="settings-panel">
          <p className="settings-panel__hint">
            Changes apply immediately across the analyst and admin interfaces.
          </p>
          <ThemePicker />
        </div>
      </section>
    </>
  );
}

export default Settings;
