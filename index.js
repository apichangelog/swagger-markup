var SwaggerParser = require('swagger-parser')
var DocumentBuilder = require('abstract-document-builder')
var MarkdownWriter = require('markdown-writer')
var ConfluenceWriter = require('confluence-writer')
var each = require('util-each')
var objectMerge = require('object-merge')

module.exports = convert

var format = {
  confluence: ConfluenceWriter,
  markdown: MarkdownWriter
}

function yes (b) {
  return b ? 'yes' : ''
}

function refname (ref) {
  return ref.replace(/.*\/([^\/])/, '$1')
}

function convert (path, frmt, options) {
  var Writer = format[frmt]
  var s = new Writer()
  var md = new DocumentBuilder(s)
  var parser = new SwaggerParser()

  function schemaOrType (info) {
    if (info.schema) {
      if (info.schema.type) {
        return info.schema.type
      }
      return md._link(refname(info.schema.$ref), '#' + refname(info.schema.$ref).replace(/[-_]/g, ''))
    }
    return info.type
  }

  parser.bundle(path, function (err, api) {
    for (var path in api.paths) {
      if (api.paths[path].parameters !== undefined) {
        var parameters = api.paths[path].parameters
        delete api.paths[path].parameters
        for (var operation in api.paths[path]) {
          if (api.paths[path][operation].parameters !== undefined) {
            api.paths[path][operation].parameters = objectMerge(parameters, api.paths[path][operation].parameters)
          } else {
            api.paths[path][operation].parameters = parameters
          }
        }
      }
    }

    if (err) {
      s.emit('error', err)
      return
    }

    md.header(1, api.info.title)
    md.text(api.info.description + '\n\n')

    md.tableHeader()
    md.tableHeaderRow('Specification', 'Value')
    md.tableRow('API Version', api.info.version)
    md.tableFooter()

    if (api['x-documentation'] !== undefined) {
      md.header(2, 'Guides');
      each(api['x-documentation'], function (doc) {
        md.anchor(doc.title.replace(/ /, '-').toLowerCase().replace(/[\/\{\}_]/g, ''));
        md.header(3, doc.title);
        md.text(doc.content);
      });
    }

    md.header(2, 'Operations')

    if (options !== undefined &&
        options.toc !== undefined &&
        options.toc) {
      md.tableHeader()
      md.tableHeaderRow('Resource Path', 'Operation', 'Description')
      each(api.paths, function (resource, rpath) {
        each(resource, function (info, method) {
          md.tableRow(rpath, md._link('`' + method.toUpperCase() + '`', '#' + [method, rpath].join('-').replace(/[\/\{\}_]/g, '')), info.summary)
        })
      })
      md.tableFooter()
    }

    each(api.paths, function (resource, rpath) {
      each(resource, function (info, method) {
        md.anchor([method, rpath].join('-').replace(/[\/\{\}_]/g, ''));
        if (options !== undefined &&
            options.renderer !== undefined &&
            options.renderer.methodPath !== undefined) {
          md.header(3, options.renderer.methodPath(method, rpath))
        } else {
          md.header(3, '`' + method.toUpperCase() + ' ' + rpath + '`')
        }
        md.text(info.description)

        if (info.parameters && info.parameters.length > 0) {
          md.header(4, 'Parameters')
          md.tableHeader()
          md.tableHeaderRow('Param Name', 'Param Type', 'Data Type', 'Description', 'Required?')
          each(info.parameters, function (param) {
            md.tableRow(param.name, param.in, schemaOrType(param), param.description, yes(param.required))
          })
          md.tableFooter()
        }

        if (info.responses) {
          md.header(4, 'Responses')
          md.tableHeader()
          md.tableHeaderRow('Code', 'Type', 'Description')
          each(info.responses, function (resp, code) {
            md.tableRow(code, schemaOrType(resp), resp.description)
          })
          md.tableFooter()
        }
      })
    })

    md.header(2, 'Definitions')
    each(api.definitions, function (def, name) {
      var r = def.required || []
      md.anchor(name.replace(/[-_]/g, ''))
      md.header(3, name)
      md.tableHeader()
      md.tableHeaderRow('Field Name', 'Field Type', 'Description', 'Required?', 'Read Only?')
      each(def.properties, function (pi, pn) {
        md.tableRow(pn, pi.type, pi.description, yes(~r.indexOf(pn)), yes(pi.readOnly))
        if (pi.items && pi.items.$ref) {
          md.tableRow(' - Item', md._link(refname(pi.items.$ref), '#' + refname(pi.items.$ref).replace(/[-_]/g, '')), '', '', '')
        }
      })
    })

    md.documentEnd()
  })

  return s
}
