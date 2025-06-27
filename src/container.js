import Viewer from './viewer.js'
import Model from './model.js'
import Interface from "./interface";
import * as bootstrap from "bootstrap";
import * as d3 from "d3";
const { build_table, save_file_as, colorDifference } = require('./utils.js')
var parser = require("biojs-io-newick");


var uid_container = 0 // unique id generator is bound to a single Container()

// Object that bind a div with a d3 Viewer() and one or multiple Model()
export default class Container {
    get uid() {
        return this._uid;
    }

    constructor(container_id, api) {

        this._uid = uid_container++; // unique container id
        this.div_id = container_id; // related div id
        this.models = []; // list of Model()
        this.settings = {}; // per container settings
        this.current_model = 0; // current model index
        this.viewer = new Viewer(this); // attach Viewer()
        this.history_actions = [] //  for Undo feature
        this.undone_actions = [] //  for Undo feature
        this.api = api
        this.message_loader = null

    }

    replace_model(old_model,new_model){
        var index = this.models.indexOf(old_model);

        if (~index) {
            this.models[index] = new_model;
        }

    }

    add_action(undo, redo, refresh_interface){

        /* undo and redo object - {'name': X, 'fonct': X, 'fonction_obj': X, 'argu': X} */

        if (this.api.undoing) {
            return
        }


        this.history_actions.push(
            {
            'undo': undo,
            'redo': redo,
            'refresh_interface' : (typeof refresh_interface !== 'undefined') ? refresh_interface : false,
            }
        )


    }

    get_last_action(){
        return this.history_actions[this.history_actions.length-1]
    }

    pop_last_action(){
        var pop  = this.history_actions.pop()
        this.undone_actions.push(pop)
        return pop
    }

    pop_redo_action(){
        return this.undone_actions.pop()
    }


    // create and add Model() configure with params
    add_tree(data, settings, from_raw_data=true){
        this.models.push(new Model(data, settings, from_raw_data))
    }

    remove_all_trees(){
        this.models = []
    }

    remove_current_tree(apply_change_UI){

        var apply_change_UI = (typeof apply_change_UI !== 'undefined') ? apply_change_UI : false;

        var current_model = this.models[this.current_model]

        const index = this.models.indexOf(current_model);
        if (index > -1) {
            this.models.splice(index, 1);

            if (this.current_model > this.models.length -1){
                console.log('out of index - recalibrating');
                this.current_model -= 1

            }

            if (apply_change_UI){
                if (this.models.length == 0){

                    this.current_model = 0

                    this.viewer.remove_data()
                    this.interface = new Interface(this.viewer, this, true)
                }
                else{
                    this.shift_model(0, false)
                }
            }

        }




    }

    // update the data viewer and render it
    start(rendering){


        if (this.models.length <= 0){
            this.interface = new Interface(this.viewer, this, true)
            return
        }

        var rendering = (typeof rendering !== 'undefined') ? rendering : false; // todo inverted ??

        this.viewer.set_data(this.models[this.current_model]);

        if (rendering){

            var z = this.models[this.current_model].zoom


            if (z) {
                this.viewer.set_zoom(z.k, z.x, z.y)
            }

            this.viewer.render(this.viewer.hierarchy);
            //this.viewer.update_collapse_level(this.models[this.current_model].settings.collapse_level)



        }

        //this.viewer.zoom_by(0.4) #STACK
        //this.viewer.render(this.viewer.hierarchy); #STACK

    }

    // shift the pointer (if possible) in the model list and update viewer model
    shift_model(offset, store_old) {


        var store_old = (typeof store_old !== 'undefined') ? store_old : true;


        if (this.current_model + offset >= 0 && this.current_model + offset <= this.models.length -1 ) {

            //this.add_action('Change tree',  this, this.shift_model, [-offset, store_old] )

            if (store_old){
                // store the current zoom information
                var old_m = this.models[this.current_model]
                old_m.store_zoomTransform(this.viewer.d3.zoomTransform(this.viewer.svg.node()))
            }

            // update new model data to viewer
            this.current_model += offset;
            var m = this.models[this.current_model]



            this.viewer.set_data(m)


            this.api.stop_all_workers()
            this.compute_topology_and_render_bounded_viewer(false)

            // apply if any stored zoom information
            var z = m.zoom
            if (z) {
                this.viewer.set_zoom(z.k, z.x, z.y)

            }

            this.viewer.render(this.viewer.hierarchy)

            if (this.api.settings.compute_distance && this.api.bound_container.includes(this)){
                this.api.send_worker_distance()
            }




        }

    }

    // send action trigger to model, update the data/build d3 data & render the viewer
    trigger_(action, data, node){

        var m = this.models[this.current_model];

        if (action === 'collapse') {

            var name_undo,name_redo;

            if (data.children && data.collapse){
                name_undo = 'Collapse this node';
                name_redo = 'Expand this node';
            }
            else {
                name_undo = 'Expand this node';
                name_redo = 'Collapse this node';
            }

            var undo = {'name': name_undo, 'fonction_obj': this, 'fonct': this.trigger_, 'argu': [action, data, node]}
            var redo = {'name': name_redo, 'fonction_obj': this, 'fonct': this.trigger_, 'argu': [action, data, node]}
            this.add_action(undo, redo)
            m.collapse(data)
            this.viewer.apply_collapse_from_data_to_d3(data, node)
            this.viewer.build_d3_cluster()
            this.viewer.render(node)

        }
        else if (action === 'collapseAll') {

            var undo = {'name': 'Expand All', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': ['expandAll', data, node]}
            var redo = {'name': 'Collapse All', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': [action, data, node]}
            this.add_action(undo, redo)

            m.collapseAll(data, true)
            this.viewer.apply_collapseAll_from_data_to_d3(data, node)
            this.viewer.build_d3_cluster()
            this.viewer.render(node)

        }
        else if (action === 'expandAll') {

            var undo = {'name': 'Collapse All', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': ['collapseAll', data, node]}
            var redo = {'name': 'Expand All', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': [action, data, node]}
            this.add_action(undo, redo)

            m.collapseAll(data, false)
            this.viewer.apply_expandAll_from_data_to_d3(data, node)
            this.viewer.build_d3_cluster()
            this.viewer.render(node)

        }
        else if (action === 'swap') {

            var undo = {'name': 'Unswap', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': ['unswap', data, node]}
            var redo = {'name': 'Swap', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': [action, data, node]}
            this.add_action(undo, redo)

            m.swap_subtrees(data)
            this.viewer.apply_swap_from_data_to_d3(data, node)
            this.viewer.build_d3_cluster()
            this.viewer.render(node)


        }
        else if (action === 'unswap') {
            m.unswap_subtrees(data)
            this.viewer.apply_unswap_from_data_to_d3(data, node)
            this.viewer.build_d3_cluster()
            this.viewer.render(node)


        }
        else if (action === 'reroot'){

            var undo = {'name': 'Reroot', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': ['reroot', this.viewer.hierarchy.children[0].data, null]}
            var redo = {'name': 'Reroot', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': [action, data, node]}
            this.add_action(undo, redo)

            m.reroot(data)
            m.rooted = true
            this.viewer.set_data(m)
            m.hierarchy_mockup = m.build_hierarchy_mockup()
            m.table = build_table(m.hierarchy_mockup)

            this.api.stop_all_workers()
            this.compute_topology_and_render_bounded_viewer(true)
            if (this.api.settings.compute_distance && this.api.bound_container.includes(this)){
                this.api.delete_modele_distance(m)
                this.api.send_worker_distance()
            }

            this.viewer.render(this.viewer.hierarchy)

            this.update_highlighted_node()


        }
        else if (action === 'trim'){
            var untrim_data = m.trim(data.data)


            var undo = {'name': 'Untrim', 'fonction_obj': this, 'fonct': this.trigger_, 'argu':['untrim', untrim_data, null]}
            var redo = {'name': 'Trim', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': [action, data, node]}
            this.add_action(undo, redo)

            this.viewer.set_data(m)
            m.hierarchy_mockup = m.build_hierarchy_mockup()
            m.table = build_table(m.hierarchy_mockup)
            this.api.stop_all_workers()
            this.compute_topology_and_render_bounded_viewer(true)
            if (this.api.settings.compute_distance && this.api.bound_container.includes(this)){
                this.api.delete_modele_distance(m)
                this.api.send_worker_distance()
            }
            this.viewer.render(this.viewer.hierarchy)
        }
        else if (action === 'untrim'){
            m.untrim(data.parent, data.floating, data.child, data.index, data.root_mode)
            this.viewer.set_data(m)
            m.hierarchy_mockup = m.build_hierarchy_mockup()
            m.table = build_table(m.hierarchy_mockup)
            this.api.stop_all_workers()
            this.compute_topology_and_render_bounded_viewer(true)
            if (this.api.settings.compute_distance && this.api.bound_container.includes(this)){
                this.api.delete_modele_distance(m)
                this.api.send_worker_distance()
            }
            this.viewer.render(this.viewer.hierarchy)
        }
        else if (action === 'force_show_label'){

            var undo = {'name': 'Toggle Label', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': [action, data, node]}
            var redo = {'name': 'Toggle Label', 'fonction_obj': this, 'fonct': this.trigger_, 'argu': [action, data, node]}
            this.add_action(undo, redo)

            m.toggle_show_label(data)
            this.viewer.apply_show_label_from_data_to_d3(data, node)
            this.viewer.build_d3_cluster()
            this.viewer.render(node)


        }
        else if (action === 'BCN'){

            var other_container = this.api.bound_container[0] === this ? this.api.bound_container[1] : this.api.bound_container[0]

            // get BCN node
            var target_node = node.data.elementBCN[other_container.viewer.model.uid]

            if (!target_node){
                console.log('No BCN node found for this container')
                return
            }

            var target_hierarchy = this.getHierarchyNodeFromModelNode(target_node, other_container.viewer.hierarchy)


            other_container.expandToRoot(target_node)
            other_container.viewer.centerNode(target_hierarchy)

            target_node._show_BCN = true
            other_container.viewer.blinking = 6
            other_container.viewer.render(other_container.viewer.hierarchy)

        }

    }

    expandToRoot(node_model ) {

        var model  = this.viewer.model;
        var hierarchy = this.viewer.hierarchy;

        var node = node_model
        while (node) {
            model.collapse(node, false)

            var node_hierarchy = this.getHierarchyNodeFromModelNode(node, hierarchy)
            this.viewer.apply_collapse_from_data_to_d3(node, node_hierarchy)
            node = node.parent; // Move to the parent node
        }

    }





    // collapse all node from depth
    collapse_depth(depth, tree){

        var f

        var model =  this.models[this.current_model];
        var viewer = this.viewer;


        if (depth == 0 ){

            f = function(n,c) {
                model.collapse(n.data, false)
                viewer.apply_collapse_from_data_to_d3(n.data, n)
            }
        }
        else {
            f = function(n,c){

                if (n.depth >= depth  ){

                    model.collapse(n.data, true)

                }
                else{
                    model.collapse(n.data, false)
                }

                viewer.apply_collapse_from_data_to_d3(n.data, n)
            }
        }

        this.models[this.current_model].traverse_hierarchy(this.viewer.hierarchy,  f )



    }

    collapse_node_not_colored(){

        var model =  this.models[this.current_model];
        var viewer = this.viewer;
        var f_pre, f_post;

        var is_leaf = function(node) {
            return !node.children && !node._children;
        }

        switch (model.settings.selected_collapse_uncolored) {

            case 'Leaves':

                f_pre = function(node, children){

                    node.colored = false;
                    node.data.colored = false;

                    if (is_leaf(node) && node.data.extended_informations[model.settings.style.color_accessor['leaf']] !== undefined  ){
                        node.colored = true;
                        node.data.colored = true;
                    }

                }

                f_post = function(child, node){

                    // go through node.data.leaves and check if one colored break
                    var leaves = child.data.leaves ? child.data.leaves : []
                    for (const leafKey in leaves) {
                        const leaf = leaves[leafKey];
                        if (leaf.colored) {
                            return
                        }
                    }

                    model.collapse(child.data, true)
                    viewer.apply_collapse_from_data_to_d3(child.data, child)
                }

                break;

            case 'Nodes':

                var f_pre = function(node, children){

                    node.colored = false;
                    node.data.colored = false;

                    if ( !is_leaf(node) && node.data.extended_informations[model.settings.style.color_accessor['node']] !== undefined  ){
                        node.colored = true;
                        node.data.colored = true;
                    }

                }

                var f_post = function(child, node){

                    if (is_leaf(child)){ return }

                    var children_list = child.children ? child.children : child._children

                    for (const childrenListKey in children_list) {

                        var e = children_list[childrenListKey]

                        if (is_leaf(e)){continue}

                        if (e.colored) {
                            return
                        }

                    }

                    model.collapse(child.data, true)
                    viewer.apply_collapse_from_data_to_d3(child.data, child)
                }

                break;
            case 'Both':

                var f_pre = function(node, children){

                    node.colored = false;
                    node.data.colored = false;

                    if ( !is_leaf(node) && node.data.extended_informations[model.settings.style.color_accessor['node']] !== undefined  ){
                        node.colored = true;
                        node.data.colored = true;
                    }
                    else if (is_leaf(node) && node.data.extended_informations[model.settings.style.color_accessor['leaf']] !== undefined  ){
                        node.colored = true;
                        node.data.colored = true;
                    }

                }

                var f_post = function(child, node){

                    if (is_leaf(child)){return}

                    var children_list = child.children ? child.children : child._children

                    for (const childrenListKey in children_list) {

                        var e = children_list[childrenListKey]

                        if (e.colored) {
                            return
                        }

                    }

                    model.collapse(child.data, true)
                    viewer.apply_collapse_from_data_to_d3(child.data, child)
                }

                break;
            default:
                console.log('Unknown collapse option: ' + model.settings.selected_collapse_uncolored)
                return;

        }

        this.models[this.current_model].traverse_hierarchy(this.viewer.hierarchy,f_pre, f_post)

    }

    monocolored_check_and_collapse(colors,child ){

        var model = this.models[this.current_model]

        switch (colors.size) {
            case 0:
                break; // no color, do nothing
            case 1:
                model.collapse(child.data, true)
                this.viewer.apply_collapse_from_data_to_d3(child.data, child)
                break;
            default:
                // compute the all pair of colorDifference in colors. If one above 10% return
                var colorArray = Array.from(colors)
                for (let i = 0; i < colorArray.length; i++) {
                    for (let j = i + 1; j < colorArray.length; j++) {
                        if (colorDifference(colorArray[i], colorArray[j]) > 0.05) {
                            return; // multiple colors, do not collapse
                        }
                    }
                }
                model.collapse(child.data, true)
                this.viewer.apply_collapse_from_data_to_d3(child.data, child)
                break
        }
    }

    collapse_node_same_color(){

        var that = this

        var model =  this.models[this.current_model];
        var viewer =  this.viewer;
        var compared_model = viewer.get_compared_model()
        var f_pre, f_post;

        var is_leaf = function(node) {
            return !node.children && !node._children;
        }


        switch (model.settings.selected_collapse_monocolored) {

            case 'Leaves':

                f_pre = function(node, children){

                    node.renderedColor = false;
                    node.data.renderedColor = false;

                    if (is_leaf(node) && node.data.extended_informations[model.settings.style.color_accessor['leaf']] !== undefined  ){
                        node.renderedColor = viewer.get_color_label(node)
                        node.data.renderedColor = viewer.get_color_label(node)

                    }

                }

                f_post = function(child, node){

                    var colors = new Set()

                    var leaves = child.data.leaves ? child.data.leaves : []

                    for (const leafKey in leaves) {
                        const leaf = leaves[leafKey];

                        if (!leaf.renderedColor) {
                            continue
                        }

                        colors.add(leaf.renderedColor)
                    }



                    that.monocolored_check_and_collapse(colors,child )

                    viewer.apply_collapse_from_data_to_d3(child.data, child)

                }

                break;

            case 'Nodes':

                f_pre = function(node, children){


                    node.renderedColor = false;
                    node.data.renderedColor = false;

                    if ( !is_leaf(node) && node.data.extended_informations[model.settings.style.color_accessor['node']] !== undefined  ){
                        node.renderedColor = viewer.color_edge(node, compared_model);
                        node.data.renderedColor = viewer.color_edge(node, compared_model);
                    }

                }

                f_post = function(child, node){

                    if (is_leaf(child)){ return }

                    var children_list = child.children ? child.children : child._children

                    // chekc if all children_list are leaf return
                    if (children_list.length === 0 || children_list.every(is_leaf)) {
                        return;
                    }

                    child.colors = new Set()

                    for (const childrenListKey in children_list) {

                        var e = children_list[childrenListKey]

                        if (is_leaf(e)){continue}


                        if (e.colors){
                            child.colors = new Set([...child.colors, ...e.colors]);

                        }
                        else{
                            child.colors.add(e.renderedColor)
                        }


                    }

                    that.monocolored_check_and_collapse(child.colors,child )


                }

                break;

            case 'Both':

                f_pre = function(node, children){


                    node.renderedColor = false;
                    node.data.renderedColor = false;

                    if ( is_leaf(node) && node.data.extended_informations[model.settings.style.color_accessor['node']] !== undefined  ){
                        node.renderedColor = viewer.color_edge(node, compared_model);
                        node.data.renderedColor = viewer.color_edge(node, compared_model);
                    }
                    else if (is_leaf(node) && node.data.extended_informations[model.settings.style.color_accessor['leaf']] !== undefined  ){
                        node.renderedColor = viewer.get_color_label(node)
                        node.data.renderedColor = viewer.get_color_label(node)
                    }

                }

                f_post = function(child, node){

                    if (is_leaf(child)){ return }

                    var children_list = child.children ? child.children : child._children

                    child.colors = new Set()

                    for (const childrenListKey in children_list) {

                        var e = children_list[childrenListKey]

                        if (e.colors){
                            child.colors = new Set([...child.colors, ...e.colors]);

                        }
                        else{
                            child.colors.add(e.renderedColor)
                        }



                    }

                    that.monocolored_check_and_collapse(child.colors,child )

                }

                break;
            default:
                console.log('Unknown collapse option: ' + model.settings.selected_collapse_uncolored)
                return;

        }

        this.models[this.current_model].traverse_hierarchy(this.viewer.hierarchy,f_pre, f_post)




    }

    highlight_node(name){

        if (name === ''){return}


        if(this.viewer.model.settings.multiple_search != true) {

            this.viewer.hierarchy.each(function (d) {
                d.data.search_path = false;
                d.data.search_node = false;
            })
        }


       function searchTree(obj,search,path){
           if(obj.data.name === search){ //if search is found return, add the object to the path and return it

               path.push(obj);
               return path;
           }
           else if(obj.children || obj._children){ //if children are collapsed d3 object will have them instantiated as _children
               var children = (obj.children) ? obj.children : obj._children;
               for(var i=0;i<children.length;i++){
                   path.push(obj);// we assume this path is the right one
                   var found = searchTree(children[i],search,path);
                   if(found){// we were right, this should return the bubbled-up path from the first if statement
                       return found;
                   }
                   else{//we were wrong, remove this parent from the path and continue iterating
                       path.pop();
                   }
               }
           }
           else{//not the right object, return false so it will continue to iterate in the loop
               return false;
           }
       }


       var p = searchTree(this.viewer.hierarchy, name, [])



       for(var i=1;i<p.length;i++){ // 1 is for skipping the root

           this.models[this.current_model].collapse(p[i].data, false)
           this.viewer.apply_collapse_from_data_to_d3(p[i].data, p[i])
           p[i].data.search_path = true;


       }

       p[p.length-1].data.search_node = true;

       this.viewer.set_data(this.models[this.current_model])
        this.viewer.render(this.viewer.hierarchy, 0);

       var n= []
       this.viewer.hierarchy.each(function(d) { if (d.data.name === name){n.push(d)}})

        //this.viewer.centerNode(n[0])


    }

    remove_highlight_node(){
        this.viewer.hierarchy.each(function(d) {
            d.data.search_path = false;
            d.data.search_node = false;
        })
    }

    update_highlighted_node(){
        var highlighted = []

        this.viewer.hierarchy.each(function(d) {

            d.data.search_path = false;

            if (d.data.search_node){
                highlighted.push(d)

            }
        })

        for (const highlightedKey in highlighted) {
            this.highlight_node(highlighted[highlightedKey].data.name)
        }


    }

    toggle_rooting(){
        this.models[this.current_model].rooted = !this.models[this.current_model].rooted
        this.interface = new Interface(this.viewer, this)
        this.viewer.render(this.viewer.hierarchy)

        if (this.api.settings.compute_distance && this.api.bound_container.includes(this)){
            this.api.delete_modele_distance(m)
            this.api.send_worker_distance()
        }

    }

    toggle_stack(){

        var ms = this.models[this.current_model].settings

        if (ms.has_histogram_data){

            ms.show_histogram = !ms.show_histogram;
            this.viewer.set_data(this.models[this.current_model])
            this.viewer.render(this.viewer.hierarchy)

        }



    }

    // INTERFACE CONTROL

    modify_node_size_percent(percent, axis ){

        var model = this.models[this.current_model]

        if (axis === 'vertical') {
            model.settings.tree.node_vertical_size = model.settings.tree.node_vertical_size * (1 + percent)
        }
        else if (axis === 'horizontal') {
            model.settings.tree.node_horizontal_size = model.settings.tree.node_horizontal_size * (1 + percent)
        }

        this.viewer.d3_cluster.nodeSize([ model.settings.tree.node_vertical_size,model.settings.tree.node_horizontal_size])
        this.viewer.build_d3_cluster()
        this.viewer.render(this.viewer.hierarchy)

        if (this.viewer.interface && model.settings.use_branch_lenght) {
            var k = this.viewer.d3.zoomTransform(d3.select("#master_g" + this.viewer.uid).node()).k
            this.viewer.interface.update_scale_value(k);
        }

    }

    modify_node_size(axis, variation){

        var model = this.models[this.current_model]
        var viewer = this.viewer

        if (axis === 'vertical') {
            if ((model.settings.tree.node_vertical_size + variation) <= 0){return}
            model.settings.tree.node_vertical_size += variation
        }
        else if (axis === 'horizontal') {
            if ((model.settings.tree.node_horizontal_size + variation) <= 0){return}
            model.settings.tree.node_horizontal_size += variation
        }

        viewer.d3_cluster.nodeSize([ model.settings.tree.node_vertical_size,model.settings.tree.node_horizontal_size])
        viewer.build_d3_cluster()
        viewer.render(viewer.hierarchy)


        if (viewer.interface && model.settings.use_branch_lenght) {
            var k = viewer.d3.zoomTransform(d3.select("#master_g" + viewer.uid).node()).k
            viewer.interface.update_scale_value(k);
        }

    }

    update_node_radius_percent(percent){

        var model = this.models[this.current_model]
        var viewer = this.viewer

        model.settings.tree.node_radius =  model.settings.tree.node_radius * (1 + percent)
        viewer.render(viewer.hierarchy)
    }

    update_line_width_percent(percent){
        var model = this.models[this.current_model]
        var viewer = this.viewer

        model.settings.tree.line_width = model.settings.tree.line_width * (1 + percent)
        viewer.render(viewer.hierarchy)
    }

    update_font_size(val){
        this.viewer.model.settings.tree.font_size = val
        this.viewer.render(this.viewer.hierarchy)
    }

    update_font_size_node(val){
        this.viewer.model.settings.style.font_size_internal = val
        this.viewer.render(this.viewer.hierarchy)
    }

    update_font_size_leaf_percent(val){
        this.viewer.model.settings.tree.font_size = this.viewer.model.settings.tree.font_size  * (1 + val)
        this.viewer.render(this.viewer.hierarchy)
    }

    update_font_size_node_percent(val){
        this.viewer.model.settings.style.font_size_internal = this.viewer.model.settings.style.font_size_internal * (1 + val)
        this.viewer.render(this.viewer.hierarchy)
    }

    //

    compute_topology_and_render_bounded_viewer(recompute=true){ // change to als eby default and deal with elementS -> one vlue instead of model uid to val

        // if bound container and compare mode activate, we need to update it too
        if (this.api.settings.compareMode && this.api.bound_container.includes(this)){



            var con1 = this.api.bound_container[0]
            var con2 =  this.api.bound_container[1]



            if ( con1.models.length > 0 && con2.models.length > 0){
                this.api.compute_visible_topology_similarity( recompute)


            var ccc = (con1 == this) ? con2 : con1
            ccc.viewer.render(ccc.viewer.hierarchy)

            }
        }
    }

    reroot_to_compared_tree(){


        var con1 = this.api.bound_container[0]
        var con2 =  this.api.bound_container[1]

        if (con1 && con2){

            if ( con1.models.length > 0 && con2.models.length > 0){
                var ccc = (con1 == this) ? con2 : con1
                var model = ccc.viewer.model

                var bcnode = model.data.children[0].elementBCN[this.viewer.model.uid]
                if(bcnode && bcnode.parent){
                    this.trigger_("reroot", bcnode)
                }
            }
        }
    }

    reorder_to_compared_tree(){

        var con1 = this.api.bound_container[0]
        var con2 =  this.api.bound_container[1]

        if (con1 && con2){

            if ( con1.models.length > 0 && con2.models.length > 0){
                var ccc = (con1 == this) ? con2 : con1
                var model_reference = ccc.viewer.model


                this.viewer.model.traverse(this.viewer.model.data, null,  (child,d) => {



                    if (child.children || child._children) {
                        var leaves =   Array.from(child.leaves, (_, k) => _.name);
                        var fixedLeaves = this.getCorrespondingNode(leaves, model_reference.data);

                        if (leaves[0] !== fixedLeaves[0] && leaves[leaves.length - 1] !== fixedLeaves[fixedLeaves.length - 1]) {
                            this.reorder_leaves(child);
                        }
                    }
                })

                this.viewer.set_data(this.viewer.model)
                this.viewer.render(this.viewer.hierarchy)

            }
        }

    }

    getCorrespondingNode(treeLeaves, ifixedTree) {

        var bestCorrespondingFixTreeLeaves = [];
        var bestCount = 0;

        this.viewer.model.traverse(ifixedTree, null,  (child,d) => {


            if (child.children || child._children) {
                var fixedTreeLeaves = Array.from(child.leaves, (_, k) => _.name);
                var count = 0;
                for (var i = 0; i < fixedTreeLeaves.length; i++) {
                    if (treeLeaves.indexOf(fixedTreeLeaves[i]) !== -1) {
                        count += 1;
                    }
                }

                if (count > bestCount) {
                    bestCorrespondingFixTreeLeaves = fixedTreeLeaves;
                    bestCount = count;
                }

            }

        })

        return bestCorrespondingFixTreeLeaves;
    }

    reorder_leaves(d){

        var bocal;

        if (d.children) {bocal = d.children }
        else if (d._children) {bocal = d._children }
        else {return}

        var e = bocal.pop()
        bocal.unshift(e)
        d.leaves = this.viewer.model.get_leaves(d)


    }

    create_model_from_hierarchy_node(node){

        var data = Object.assign({}, node.data);

        this.viewer.model.traverse(data, function(n,c){
            n.parent=null;
            n.leaves=null;
            n.correspondingLeaf = {}
            n.elementBCN = null})


        var data = JSON.parse(JSON.stringify(data))

        var model = this.viewer.model;
        this.add_tree(data, model.settings, false)

        this.models[this.models.length-1].add_circularity_back()

        this.viewer.model.add_circularity_back()

        this.interface = new Interface(this.viewer, this)



    }

    export_as_newick(){
        var nwk = parser.parse_json(this.viewer.model.remove_circularity())

        save_file_as(this.viewer.model.settings.name  + ".nwk", nwk)


    }

    escape_string_for_nhx(str){
        // replace ( ) [ ] , : ; as well as white space with _
        return str.replace(/[\s\(\)\[\],:;]/g, '_')
    }
    convertToExtendedNewick(node) {
        let result = '';

        if (node.children) {
            const childrenNewick = node.children.map(this.convertToExtendedNewick, this).join(',');
            result += `(${childrenNewick})`;
        }

        result += node.name;


        if (node.extended_informations['Length'] !== undefined) {
            result += `:${node.branch_length}`;
        }

        var str_extended = ''

        for (const key in node.extended_informations) {
            if (key !== 'Length' && node.extended_informations[key] ) {
                str_extended += `:${key}=${this.escape_string_for_nhx(node.extended_informations[key])}`;
            }
        }

        if (str_extended !== '') {
            result += `[&&NHX${str_extended}]`
        }

        return result;
    }

    export_as_nhx(){
        var nhx = this.convertToExtendedNewick(this.viewer.model.data)

        save_file_as(this.viewer.model.settings.name  + ".nhx", nhx)


    }

    traverseAllNodes(node, callback) {
        callback(node); // Apply the callback to the current node
        const children = node.children || node._children; // Include both expanded and collapsed nodes
        if (children) {
            children.forEach((child) => this.traverseAllNodes(child, callback));
        }
    }

    getHierarchyNodeFromModelNode(modelNode, hierarchy) {
        let equivalentNode = null;

        this.traverseAllNodes(hierarchy, (d) => {
            if (d.data === modelNode) {
                equivalentNode = d;
            }
        });

        return equivalentNode;
    }




};


