--[[
  exposure-triangle shortcode
  ---------------------------------------------------------------------------
  Embeds the <exposure-triangle> web component (an interactive ISO / Time /
  Aperture exposure visualiser with a live WebGL preview) into RevealJS or
  plain HTML output.

  Usage in a .qmd:

      {{< exposure-triangle >}}

      {{< exposure-triangle accent="#2A6FDB" height="600px" spin=true >}}

      {{< exposure-triangle floor-grid=false scene="my-photo.png" >}}

  Recognised arguments (all optional) mirror the component's attributes:

      accent       dial + marker colour          (default #F5B544)
      scene        preview photo URL             (default: bundled scene.png)
      floor-grid   false  -> hide the F-T grid    (default shown)
      spin         true   -> auto-rotate          (default off)
      three-src    override the Three.js URL
      height       CSS height of the widget box   (default 560px)
      width        CSS width  of the widget box
      style        extra inline CSS appended verbatim
      class        extra CSS class(es)
--]]

-- HTML-escape a value destined for a double-quoted attribute.
local function esc(s)
  s = s:gsub("&", "&amp;")
  s = s:gsub('"', "&quot;")
  s = s:gsub("<", "&lt;")
  s = s:gsub(">", "&gt;")
  return s
end

-- Pull a named value out of kwargs, returning nil when absent/empty.
local function kw(kwargs, name)
  local v = kwargs[name]
  if v == nil then return nil end
  local s = pandoc.utils.stringify(v)
  if s == "" then return nil end
  return s
end

-- Truthy test for boolean-style arguments.
local function truthy(s)
  if s == nil then return false end
  s = s:lower()
  return s == "true" or s == "1" or s == "yes" or s == "on" or s == ""
end

local function exposure_triangle(args, kwargs, meta)
  -- Only emit markup for HTML-based, JS-capable formats (html, revealjs, ...).
  if not quarto.doc.is_format("html:js") then
    return pandoc.Null()
  end

  -- Bundle the component script and its default photo. The script self-locates
  -- scene.png relative to its own URL, so the asset is found in the lib folder.
  quarto.doc.add_html_dependency({
    name = "exposure-triangle",
    version = "1.0.0",
    scripts = { "exposure-triangle.js" },
    resources = { "scene.png" },
  })

  -- Bare positional flags, e.g. {{< exposure-triangle spin >}}.
  local flags = {}
  for _, a in ipairs(args) do
    flags[pandoc.utils.stringify(a):lower()] = true
  end

  local accent    = kw(kwargs, "accent")
  local scene     = kw(kwargs, "scene")
  local floorGrid = kw(kwargs, "floor-grid")
  local spin      = kw(kwargs, "spin")
  local threeSrc  = kw(kwargs, "three-src")
  local height    = kw(kwargs, "height") or "560px"
  local width     = kw(kwargs, "width")
  local style     = kw(kwargs, "style")
  local class     = kw(kwargs, "class")

  -- Assemble attributes.
  local attrs = {}
  if accent then attrs[#attrs + 1] = 'accent="' .. esc(accent) .. '"' end
  if scene then attrs[#attrs + 1] = 'scene="' .. esc(scene) .. '"' end
  -- floor-grid only needs emitting when hidden (default is shown).
  if floorGrid ~= nil and not truthy(floorGrid) then
    attrs[#attrs + 1] = 'floor-grid="false"'
  end
  if truthy(spin) or flags["spin"] then attrs[#attrs + 1] = "spin" end
  if threeSrc then attrs[#attrs + 1] = 'three-src="' .. esc(threeSrc) .. '"' end
  if class then attrs[#attrs + 1] = 'class="' .. esc(class) .. '"' end

  -- Assemble inline style (box sizing).
  local css = "height:" .. esc(height) .. ";"
  if width then css = css .. "width:" .. esc(width) .. ";" end
  if style then css = css .. esc(style) end
  attrs[#attrs + 1] = 'style="' .. css .. '"'

  local html = "<exposure-triangle " .. table.concat(attrs, " ") .. "></exposure-triangle>"
  return pandoc.RawBlock("html", html)
end

return {
  ["exposure-triangle"] = exposure_triangle,
}
