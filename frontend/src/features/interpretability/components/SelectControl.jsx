const SelectControl = ({ C, defaultValue, children }) => (
  <select
    style={{
      height: 24,
      borderRadius: 5,
      border: `1px solid ${C.border}`,
      background: C.panel2,
      color: C.text,
      fontSize: 9,
      padding: "0 8px",
      outline: "none",
      maxWidth: 112 }}
    defaultValue={defaultValue}
  >
    {children}
  </select>
);

export default SelectControl;
export { SelectControl };
