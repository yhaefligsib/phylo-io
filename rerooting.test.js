/**
 * @jest-environment jsdom
 */


const PhyloIO = require("./dist-jest/phylo.js").PhyloIO;
const utils = require('./src/utils.js')

var data = '((C,D)1,(A,(B,X)3)2,E);'

// get string made of concatenation  of leaves name from node.leaves
const getSortedLeaves = (node) => {
    return node.leaves.map(leaf => leaf.name).sort();
}

const verify_boostrap_default = (node, children) =>  {

    var con_leaves = getSortedLeaves(node)

    if ( con_leaves.length <= 1) {
        return;
    }

    var str_leaves = JSON.stringify(con_leaves);

    switch (str_leaves){
        case JSON.stringify(['A', 'B', 'X']):
            expect(node.extended_informations.Data).toBe("2");
            break;
        case JSON.stringify(['B', 'X']):
            expect(node.extended_informations.Data).toBe("3");
            break;
        case JSON.stringify(['C', 'D']):
            expect(node.extended_informations.Data).toBe("1");
            break;
        case JSON.stringify(['A', 'B', 'C', 'D', 'E', 'X']):
            expect(node.extended_informations.Data).toBeUndefined();
            break;
        default:
            expect(true).toBe(false);
            break
    }
}

test('test reroot on X' , () => {

    const phylo = PhyloIO.init();

    // >>>  test with  internal label for branches
    var m1 = phylo._create_model(data, {'data_type' : 'nhx'})
    m1.settings.edge_related_data.push('Data');
    m1.traverse(m1.data,verify_boostrap_default);

    // reroot on X
    var x_node = m1.data.leaves.find(leaf => leaf.name === 'X');
    m1.reroot(x_node);
    m1.traverse(m1.data,function(node, children) {

        var con_leaves = getSortedLeaves(node)

        if ( con_leaves.length <= 1) {
            return;
        }

        var str_leaves = JSON.stringify(con_leaves);

        switch (str_leaves){
            case JSON.stringify(['C', 'D', 'E']):
                expect(node.extended_informations.Data).toBe("2");
                break;
            case JSON.stringify(['C', 'D']):
                expect(node.extended_informations.Data).toBe("1");
                break;
            case JSON.stringify(['A', 'B', 'C', 'D', 'E', 'X']):
                expect(node.extended_informations.Data).toBeNull();
                break;
            case JSON.stringify(['A', 'C', 'D', 'E']):
                expect(node.extended_informations.Data).toBe("3");
                break;
            case JSON.stringify(['A', 'B', 'C', 'D', 'E']):
                expect(node.extended_informations.Data).toBeUndefined();
                break;
            default:
                expect(true).toBe(false);
                break
        }
    });

    // >>> test without internal label for branches
    var m2 = phylo._create_model(data, {'data_type' : 'nhx'})
    m2.traverse(m2.data,verify_boostrap_default);

    // reroot on X
    var x_node2 = m2.data.leaves.find(leaf => leaf.name === 'X');
    m2.reroot(x_node2);
    m2.traverse(m2.data,function(node, children) {

        var con_leaves = getSortedLeaves(node)

        if ( con_leaves.length <= 1) {
            return;
        }

        var str_leaves = JSON.stringify(con_leaves);

        switch (str_leaves){
            case JSON.stringify(['C', 'D', 'E']):
                expect(node.extended_informations.Data).toBeUndefined()
                break;
            case JSON.stringify(['C', 'D']):
                expect(node.extended_informations.Data).toBe("1");
                break;
            case JSON.stringify(['A', 'B', 'C', 'D', 'E', 'X']):
                expect(node.extended_informations.Data).toBeUndefined();
                break;
            case JSON.stringify(['A', 'C', 'D', 'E']):
                expect(node.extended_informations.Data).toBe("2");
                break;
            case JSON.stringify(['A', 'B', 'C', 'D', 'E']):
                expect(node.extended_informations.Data).toBe("3");
                break;
            default:
                expect(true).toBe(false);
                break
        }
    });

})

test('test reroot on B/X > C/D > B/X ' , () => {

    const phylo = PhyloIO.init();

    // >>>  test with  internal label for branches
    var m1 = phylo._create_model(data, {'data_type' : 'nhx'})
    m1.settings.edge_related_data.push('Data');
    m1.traverse(m1.data,verify_boostrap_default);

    // reroot on BX
    var bx_node = null;
    m1.traverse(m1.data, function(node, children) {

        var con_leaves = getSortedLeaves(node)

        if ( con_leaves.length <= 1) {
            return;
        }

        var str_leaves = JSON.stringify(con_leaves);

        if (str_leaves === JSON.stringify(['B', 'X'])) {
            bx_node = node;
        }
    });
    m1.reroot(bx_node);
    m1.traverse(m1.data,function(node, children) {

        var con_leaves = getSortedLeaves(node)

        if ( con_leaves.length <= 1) {
            return;
        }

        var str_leaves = JSON.stringify(con_leaves);

        switch (str_leaves){
            case JSON.stringify(['C', 'D', 'E']):
                expect(node.extended_informations.Data).toBe("2");
                break;
            case JSON.stringify(['C', 'D']):
                expect(node.extended_informations.Data).toBe("1");
                break;
            case JSON.stringify(['A', 'B', 'C', 'D', 'E', 'X']):
                expect(node.extended_informations.Data).toBeNull();
                break;
            case JSON.stringify(['A', 'C', 'D', 'E']):
                expect(node.extended_informations.Data).toBe("3");
                break;
            case JSON.stringify(['B', 'X']):
                expect(node.extended_informations.Data).toBe("3");
                break;
            default:
                expect(true).toBe(false);
                break
        }
    });

    // reroot on CD
    var cd_node = null;
    m1.traverse(m1.data, function(node, children) {

        var con_leaves = getSortedLeaves(node)

        if ( con_leaves.length <= 1) {
            return;
        }

        var str_leaves = JSON.stringify(con_leaves);

        if (str_leaves === JSON.stringify(['C', 'D'])) {
            cd_node = node;
        }
    });
    m1.reroot(cd_node);
    m1.traverse(m1.data,function(node, children) {

        var con_leaves = getSortedLeaves(node)

        if ( con_leaves.length <= 1) {
            return;
        }

        var str_leaves = JSON.stringify(con_leaves);

        switch (str_leaves){
            case JSON.stringify(['A', 'B', 'X']):
                expect(node.extended_informations.Data).toBe("2");
                break;
            case JSON.stringify(['C', 'D']):
                expect(node.extended_informations.Data).toBe("1");
                break;
            case JSON.stringify(['A', 'B', 'C', 'D', 'E', 'X']):
                expect(node.extended_informations.Data).toBeNull();
                break;
            case JSON.stringify(['A', 'B', 'E', 'X']):
                expect(node.extended_informations.Data).toBe("1");
                break;
            case JSON.stringify(['B', 'X']):
                expect(node.extended_informations.Data).toBe("3");
                break;
            default:
                expect(true).toBe(false);
                break
        }
    });

    // reroot on BX
    var bx2_node = null;
    m1.traverse(m1.data, function(node, children) {

        var con_leaves = getSortedLeaves(node)

        if ( con_leaves.length <= 1) {
            return;
        }

        var str_leaves = JSON.stringify(con_leaves);

        console.log(str_leaves)

        if (str_leaves === JSON.stringify(['B', 'X'])) {

            bx2_node = node;
        }
    });
    m1.reroot(bx2_node);
    m1.traverse(m1.data,function(node, children) {

        var con_leaves = getSortedLeaves(node)

        if ( con_leaves.length <= 1) {
            return;
        }

        var str_leaves = JSON.stringify(con_leaves);

        switch (str_leaves){
            case JSON.stringify(['C', 'D', 'E']):
                expect(node.extended_informations.Data).toBe("2");
                break;
            case JSON.stringify(['C', 'D']):
                expect(node.extended_informations.Data).toBe("1");
                break;
            case JSON.stringify(['A', 'B', 'C', 'D', 'E', 'X']):
                expect(node.extended_informations.Data).toBeNull();
                break;
            case JSON.stringify(['A', 'C', 'D', 'E']):
                expect(node.extended_informations.Data).toBe("3");
                break;
            case JSON.stringify(['B', 'X']):
                expect(node.extended_informations.Data).toBe("3");
                break;
            default:
                expect(true).toBe(false);
                break
        }
    });


})







